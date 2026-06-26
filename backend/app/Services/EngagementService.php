<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * EngagementService — choices/polls + feedback forms (spec §3 Phase 3, §15).
 * Non-graded data collection. Choices store options as JSONB; responses record
 * the chosen option. Anonymous choices hide who chose what in aggregates.
 */
class EngagementService
{
    // ── Choice / poll ──
    public function createChoice(string $tenantId, array $data): object
    {
        foreach (['courseId', 'name', 'options'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                'INSERT INTO choices (tenant_id, course_id, name, options, allow_multiple, anonymous)
                 VALUES (?, ?, ?, ?, COALESCE(?,false), COALESCE(?,false))
                 RETURNING id, name, options, allow_multiple, anonymous',
                [
                    $tenantId, $data['courseId'], $data['name'],
                    json_encode($data['options']), $data['allowMultiple'] ?? null, $data['anonymous'] ?? null,
                ]
            );
        });
    }

    public function respondChoice(string $tenantId, string $choiceId, string $userId, string $optionId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $choiceId, $userId, $optionId) {
            $choice = DB::selectOne('SELECT id, allow_multiple FROM choices WHERE id = ?', [$choiceId]);
            if (! $choice) {
                throw new HttpException(404, 'Choice not found');
            }
            if (! $choice->allow_multiple) {
                // single-choice: clear prior response
                DB::statement('DELETE FROM choice_responses WHERE choice_id = ? AND user_id = ?', [$choiceId, $userId]);
            }

            return DB::selectOne(
                'INSERT INTO choice_responses (tenant_id, choice_id, user_id, option_id)
                 VALUES (?, ?, ?, ?) RETURNING id, option_id, created_at',
                [$tenantId, $choiceId, $userId, $optionId]
            );
        });
    }

    /** Tally results per option (respects anonymity — counts only). */
    public function choiceResults(string $tenantId, string $choiceId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($choiceId) {
            return DB::select(
                'SELECT option_id, COUNT(*) AS votes FROM choice_responses
                  WHERE choice_id = ? GROUP BY option_id ORDER BY votes DESC',
                [$choiceId]
            );
        });
    }

    // ── Feedback form responses ──
    public function submitFeedback(string $tenantId, string $formId, string $userId, array $answers): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $formId, $userId, $answers) {
            return DB::selectOne(
                'INSERT INTO feedback_responses (tenant_id, form_id, user_id, answers)
                 VALUES (?, ?, ?, ?) RETURNING id, form_id, created_at',
                [$tenantId, $formId, $userId, json_encode($answers)]
            );
        });
    }
}
