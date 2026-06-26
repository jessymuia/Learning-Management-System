<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * QuizOverrideService — per-user / per-group quiz overrides (spec §5.2).
 * Grants a specific learner extra time, extra attempts, or a different window.
 * resolveFor() returns the effective settings a learner sees (override merged
 * over the quiz defaults), which startAttempt uses to compute due_at + limits.
 */
class QuizOverrideService
{
    public function setOverride(string $tenantId, string $quizId, array $data): object
    {
        if (empty($data['userId']) && empty($data['groupId'])) {
            throw new HttpException(400, 'Either userId or groupId is required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $quizId, $data) {
            return DB::selectOne(
                "INSERT INTO quiz_overrides
                   (tenant_id, quiz_id, user_id, group_id, open_at, close_at, time_limit_s, attempts_allowed)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (tenant_id, quiz_id, user_id) WHERE user_id IS NOT NULL
                 DO UPDATE SET open_at = EXCLUDED.open_at, close_at = EXCLUDED.close_at,
                              time_limit_s = EXCLUDED.time_limit_s, attempts_allowed = EXCLUDED.attempts_allowed
                 RETURNING id, quiz_id, user_id, group_id, time_limit_s, attempts_allowed",
                [
                    $tenantId, $quizId, $data['userId'] ?? null, $data['groupId'] ?? null,
                    $data['openAt'] ?? null, $data['closeAt'] ?? null,
                    $data['timeLimitS'] ?? null, $data['attemptsAllowed'] ?? null,
                ]
            );
        });
    }

    /** Effective settings for a learner: override (user, then their group) over defaults. */
    public function resolveFor(string $tenantId, string $quizId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($quizId, $userId) {
            $quiz = DB::selectOne(
                'SELECT open_at, close_at, time_limit_s, attempts_allowed FROM quizzes WHERE id = ?',
                [$quizId]
            );
            if (! $quiz) {
                throw new HttpException(404, 'Quiz not found');
            }
            // user override first
            $ov = DB::selectOne(
                'SELECT open_at, close_at, time_limit_s, attempts_allowed
                   FROM quiz_overrides WHERE quiz_id = ? AND user_id = ?',
                [$quizId, $userId]
            );
            // else a group override the user belongs to
            if (! $ov) {
                $ov = DB::selectOne(
                    'SELECT o.open_at, o.close_at, o.time_limit_s, o.attempts_allowed
                       FROM quiz_overrides o
                       JOIN group_members gm ON gm.group_id = o.group_id AND gm.user_id = ?
                      WHERE o.quiz_id = ? LIMIT 1',
                    [$userId, $quizId]
                );
            }

            return (object) [
                'open_at' => $ov->open_at ?? $quiz->open_at,
                'close_at' => $ov->close_at ?? $quiz->close_at,
                'time_limit_s' => $ov->time_limit_s ?? $quiz->time_limit_s,
                'attempts_allowed' => $ov->attempts_allowed ?? $quiz->attempts_allowed,
                'has_override' => (bool) $ov,
            ];
        });
    }
}
