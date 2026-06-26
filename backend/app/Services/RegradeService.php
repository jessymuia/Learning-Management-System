<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * RegradeService — batched, version-pinned regrade with dry-run preview
 * (spec §5.5). Each attempt_step recorded the question_version_id it was taken
 * against, so regrading is deterministic: re-run the auto-grader against the
 * SAME version the learner saw, never the current one. Dry-run reports how many
 * attempts/grades would change before committing.
 */
class RegradeService
{
    public function __construct(private QuestionGradingService $grader) {}

    /**
     * Preview or apply a regrade for a whole quiz.
     * @return array{changed:int,total:int,details:array}
     */
    public function regradeQuiz(string $tenantId, string $quizId, bool $apply = false): array
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $quizId, $apply) {
            // every graded step across all attempts of this quiz, with its pinned version
            $steps = DB::select(
                "SELECT s.id AS step_id, s.attempt_id, s.slot_num, s.response, s.fraction AS old_fraction,
                        s.question_version_id, q.qtype, qv.data
                   FROM attempt_steps s
                   JOIN quiz_attempts a ON a.id = s.attempt_id
                   JOIN question_versions qv ON qv.id = s.question_version_id
                   JOIN questions q ON q.id = qv.question_id
                  WHERE a.quiz_id = ? AND s.fraction IS NOT NULL",
                [$quizId]
            );

            $changed = 0;
            $details = [];
            $affectedAttempts = [];

            foreach ($steps as $st) {
                $data = is_string($st->data) ? json_decode($st->data, true) : (array) $st->data;
                $resp = is_string($st->response) ? json_decode($st->response, true) : $st->response;
                $newFraction = $this->grader->grade($st->qtype, $data ?? [], $resp);

                if ($newFraction === null) {
                    continue; // manual question — skip
                }
                $old = (float) $st->old_fraction;
                if (abs($newFraction - $old) > 0.00001) {
                    $changed++;
                    $affectedAttempts[$st->attempt_id] = true;
                    $details[] = [
                        'attempt_id' => $st->attempt_id,
                        'slot' => $st->slot_num,
                        'old' => $old,
                        'new' => $newFraction,
                    ];

                    if ($apply) {
                        // append a NEW regrade step (append-only), then re-sum the attempt
                        DB::statement(
                            "INSERT INTO attempt_steps
                               (tenant_id, attempt_id, question_version_id, slot_num, seq, action, state, response, fraction)
                             VALUES (?, ?, ?, ?,
                                     (SELECT COALESCE(MAX(seq),0)+1 FROM attempt_steps WHERE attempt_id = ?),
                                     'regrade', 'regraded', ?, ?)",
                            [$tenantId, $st->attempt_id, $st->question_version_id, $st->slot_num,
                             $st->attempt_id, json_encode($resp), $newFraction]
                        );
                    }
                }
            }

            // recompute attempt sumgrades for affected attempts when applying
            if ($apply) {
                foreach (array_keys($affectedAttempts) as $attemptId) {
                    DB::statement(
                        "UPDATE quiz_attempts qa SET sumgrade = (
                           WITH latest AS (
                             SELECT DISTINCT ON (slot_num) slot_num, fraction
                               FROM attempt_steps WHERE attempt_id = ? AND fraction IS NOT NULL
                               ORDER BY slot_num, seq DESC)
                           SELECT COALESCE(SUM(l.fraction * qs.maxmark),0)
                             FROM latest l JOIN quiz_slots qs ON qs.quiz_id = qa.quiz_id AND qs.slot_num = l.slot_num)
                         WHERE qa.id = ?",
                        [$attemptId, $attemptId]
                    );
                }
            }

            return [
                'changed' => $changed,
                'total' => count($steps),
                'attempts_affected' => count($affectedAttempts),
                'applied' => $apply,
                'details' => array_slice($details, 0, 100),
            ];
        });
    }
}
