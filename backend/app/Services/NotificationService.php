<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * NotificationService — queued, templated notifications (spec §13 Phase 1, §7.5).
 * Writes notification rows; a worker delivers them per channel (email/sms/push)
 * and stamps sent_at. Per-user preferences live in users.profile.
 */
class NotificationService
{
    /** Queue a notification for a user. */
    public function queue(string $tenantId, string $userId, string $type, array $payload, string $channel = 'inapp'): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $userId, $type, $payload, $channel) {
            return DB::selectOne(
                'INSERT INTO notifications (tenant_id, user_id, channel, type, payload)
                 VALUES (?, ?, ?, ?, ?)
                 RETURNING id, channel, type, created_at',
                [$tenantId, $userId, $channel, $type, json_encode($payload)]
            );
        });
    }

    /** A user's in-app notifications (most recent first). */
    public function listForUser(string $tenantId, string $userId, bool $unreadOnly = false): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId, $unreadOnly) {
            $sql = 'SELECT id, channel, type, payload, read_at, created_at
                      FROM notifications WHERE user_id = ?';
            if ($unreadOnly) {
                $sql .= ' AND read_at IS NULL';
            }
            $sql .= ' ORDER BY created_at DESC LIMIT 50';

            return DB::select($sql, [$userId]);
        });
    }

    public function markRead(string $tenantId, string $notificationId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($notificationId, $userId) {
            $row = DB::selectOne(
                'UPDATE notifications SET read_at = now()
                  WHERE id = ? AND user_id = ? RETURNING id, read_at',
                [$notificationId, $userId]
            );
            if (! $row) {
                throw new HttpException(404, 'Notification not found');
            }

            return $row;
        });
    }
}
