<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * ForumService — threaded discussions (spec Phase 3). forums → discussions →
 * posts (posts self-reference via parent_id for threading). Same style.
 */
class ForumService
{
    public function createForum(string $tenantId, array $data): object
    {
        foreach (['courseId', 'name'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                "INSERT INTO forums (tenant_id, course_id, name, intro, type)
                 VALUES (?, ?, ?, ?, COALESCE(?,'general'))
                 RETURNING id, course_id, name, type, created_at",
                [
                    $tenantId, $data['courseId'], $data['name'],
                    isset($data['intro']) ? json_encode($data['intro']) : null,
                    $data['type'] ?? null,
                ]
            );
        });
    }

    public function listForums(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT id, name, type, created_at FROM forums WHERE course_id = ? ORDER BY created_at',
                [$courseId]
            );
        });
    }

    public function startDiscussion(string $tenantId, string $forumId, string $authorId, array $data): object
    {
        if (empty($data['subject']) || empty($data['message'])) {
            throw new HttpException(400, 'subject and message are required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $forumId, $authorId, $data) {
            $forum = DB::selectOne('SELECT id FROM forums WHERE id = ?', [$forumId]);
            if (! $forum) {
                throw new HttpException(404, 'Forum not found');
            }

            $disc = DB::selectOne(
                'INSERT INTO discussions (tenant_id, forum_id, author_id, subject)
                 VALUES (?, ?, ?, ?) RETURNING id, subject, created_at',
                [$tenantId, $forumId, $authorId, $data['subject']]
            );
            // first post (the body of the discussion)
            DB::statement(
                'INSERT INTO posts (tenant_id, discussion_id, author_id, message)
                 VALUES (?, ?, ?, ?)',
                [$tenantId, $disc->id, $authorId, json_encode($data['message'])]
            );

            return $disc;
        });
    }

    public function reply(string $tenantId, string $discussionId, string $authorId, array $data): object
    {
        if (empty($data['message'])) {
            throw new HttpException(400, 'message is required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $discussionId, $authorId, $data) {
            $disc = DB::selectOne('SELECT id, locked FROM discussions WHERE id = ?', [$discussionId]);
            if (! $disc) {
                throw new HttpException(404, 'Discussion not found');
            }
            if ($disc->locked) {
                throw new HttpException(409, 'Discussion is locked');
            }

            return DB::selectOne(
                'INSERT INTO posts (tenant_id, discussion_id, parent_id, author_id, message)
                 VALUES (?, ?, ?, ?, ?)
                 RETURNING id, parent_id, author_id, created_at',
                [
                    $tenantId, $discussionId, $data['parentId'] ?? null,
                    $authorId, json_encode($data['message']),
                ]
            );
        });
    }

    public function listDiscussions(string $tenantId, string $forumId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($forumId) {
            return DB::select(
                'SELECT id, subject, author_id, pinned, locked, created_at
                   FROM discussions WHERE forum_id = ? ORDER BY pinned DESC, created_at DESC',
                [$forumId]
            );
        });
    }

    public function listPosts(string $tenantId, string $discussionId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($discussionId) {
            return DB::select(
                'SELECT id, parent_id, author_id, message, is_answer, rating_sum, created_at
                   FROM posts WHERE discussion_id = ? ORDER BY created_at',
                [$discussionId]
            );
        });
    }

    /** Rate a post (one rating per user; updates posts.rating_sum). spec §3 */
    public function ratePost(string $tenantId, string $postId, string $userId, int $rating): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $postId, $userId, $rating) {
            $post = DB::selectOne('SELECT id FROM posts WHERE id = ?', [$postId]);
            if (! $post) {
                throw new HttpException(404, 'Post not found');
            }
            // upsert the user's rating
            DB::statement(
                "INSERT INTO post_ratings (tenant_id, post_id, user_id, rating)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT (tenant_id, post_id, user_id) DO UPDATE SET rating = EXCLUDED.rating",
                [$tenantId, $postId, $userId, $rating]
            );
            // recompute rating_sum from the ratings table (authoritative)
            DB::statement(
                "UPDATE posts SET rating_sum = (SELECT COALESCE(SUM(rating),0) FROM post_ratings WHERE post_id = ?)
                  WHERE id = ?",
                [$postId, $postId]
            );

            return DB::selectOne('SELECT id, rating_sum FROM posts WHERE id = ?', [$postId]);
        });
    }

    /** Mark a post as the accepted answer (Q&A forums). spec §3 */
    public function markAnswer(string $tenantId, string $postId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($postId) {
            $row = DB::selectOne('UPDATE posts SET is_answer = true WHERE id = ? RETURNING id, is_answer', [$postId]);
            if (! $row) {
                throw new HttpException(404, 'Post not found');
            }
            return $row;
        });
    }

    /** Moderation: pin/lock a discussion. spec §3 */
    public function moderateDiscussion(string $tenantId, string $discussionId, ?bool $pinned, ?bool $locked): object
    {
        return TenantContext::withTenant($tenantId, function () use ($discussionId, $pinned, $locked) {
            $sets = [];
            $params = [];
            if ($pinned !== null) { $sets[] = 'pinned = ?'; $params[] = $pinned ? 'true' : 'false'; }
            if ($locked !== null) { $sets[] = 'locked = ?'; $params[] = $locked ? 'true' : 'false'; }
            if (! $sets) {
                throw new HttpException(400, 'Nothing to update');
            }
            $params[] = $discussionId;
            $row = DB::selectOne(
                'UPDATE discussions SET '.implode(', ', $sets).' WHERE id = ? RETURNING id, pinned, locked',
                $params
            );
            if (! $row) {
                throw new HttpException(404, 'Discussion not found');
            }
            return $row;
        });
    }
}
