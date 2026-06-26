<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * MessagingService — 1:1 and group conversations (spec §3 Phase 3, §15).
 * conversations → conversation_members → messages. Membership gates access;
 * last_read_at drives unread counts.
 */
class MessagingService
{
    /** Start a conversation with a set of member user ids (includes creator). */
    public function createConversation(string $tenantId, string $creatorId, array $memberIds, ?string $title, string $type = 'direct'): object
    {
        $members = array_values(array_unique(array_merge([$creatorId], $memberIds)));
        if (count($members) < 2) {
            throw new HttpException(400, 'A conversation needs at least two members');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $members, $title, $type) {
            $conv = DB::selectOne(
                'INSERT INTO conversations (tenant_id, type, title) VALUES (?, ?, ?)
                 RETURNING id, type, title, created_at',
                [$tenantId, $type, $title]
            );
            foreach ($members as $uid) {
                DB::statement(
                    'INSERT INTO conversation_members (tenant_id, conversation_id, user_id)
                     VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
                    [$tenantId, $conv->id, $uid]
                );
            }

            return $conv;
        });
    }

    public function send(string $tenantId, string $conversationId, string $senderId, array $body): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $conversationId, $senderId, $body) {
            $member = DB::selectOne(
                'SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
                [$conversationId, $senderId]
            );
            if (! $member) {
                throw new HttpException(403, 'You are not a member of this conversation');
            }

            return DB::selectOne(
                'INSERT INTO messages (tenant_id, conversation_id, sender_id, body)
                 VALUES (?, ?, ?, ?) RETURNING id, sender_id, body, created_at',
                [$tenantId, $conversationId, $senderId, json_encode($body)]
            );
        });
    }

    public function listConversations(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            return DB::select(
                'SELECT c.id, c.type, c.title, c.created_at,
                        (SELECT COUNT(*) FROM messages m
                          WHERE m.conversation_id = c.id
                            AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)) AS unread
                   FROM conversations c
                   JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
                  ORDER BY c.created_at DESC',
                [$userId]
            );
        });
    }

    public function listMessages(string $tenantId, string $conversationId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($conversationId, $userId) {
            $member = DB::selectOne(
                'SELECT 1 AS ok FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
                [$conversationId, $userId]
            );
            if (! $member) {
                throw new HttpException(403, 'You are not a member of this conversation');
            }
            // mark read
            DB::statement(
                'UPDATE conversation_members SET last_read_at = now() WHERE conversation_id = ? AND user_id = ?',
                [$conversationId, $userId]
            );

            return DB::select(
                'SELECT id, sender_id, body, created_at FROM messages
                  WHERE conversation_id = ? ORDER BY created_at LIMIT 200',
                [$conversationId]
            );
        });
    }
}
