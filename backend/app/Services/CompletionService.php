<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CompletionService — activity + course completion (spec §13 Phase 2, §7.5).
 * Marking an activity complete may complete the course (when all completion-
 * tracked modules are done), which in turn triggers program progress recompute.
 */
class CompletionService
{
    public function __construct(private ProgramService $programs) {}

    /** Mark (or update) a user's completion state for a module. */
    public function markActivity(string $tenantId, string $moduleId, string $userId, int $state): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $moduleId, $userId, $state) {
            $module = DB::selectOne('SELECT id, course_id FROM course_modules WHERE id = ?', [$moduleId]);
            if (! $module) {
                throw new HttpException(404, 'Module not found');
            }

            $row = DB::selectOne(
                "INSERT INTO activity_completion (tenant_id, module_id, user_id, state, completed_at)
                 VALUES (?, ?, ?, ?, CASE WHEN ? >= 1 THEN now() ELSE NULL END)
                 ON CONFLICT (tenant_id, module_id, user_id) DO UPDATE SET
                   state = EXCLUDED.state,
                   completed_at = CASE WHEN EXCLUDED.state >= 1 THEN now() ELSE NULL END
                 RETURNING module_id, user_id, state, completed_at",
                [$tenantId, $moduleId, $userId, $state, $state]
            );

            // re-evaluate course completion
            $this->evaluateCourse($tenantId, $module->course_id, $userId);

            return $row;
        });
    }

    /** Course completes when every visible module with completion tracking is complete. */
    private function evaluateCourse(string $tenantId, string $courseId, string $userId): void
    {
        $stats = DB::selectOne(
            "SELECT
               COUNT(*) FILTER (WHERE cm.completion IS NOT NULL AND cm.completion <> '{}'::jsonb) AS tracked,
               COUNT(*) FILTER (WHERE cm.completion IS NOT NULL AND cm.completion <> '{}'::jsonb
                                 AND ac.state >= 1) AS done
             FROM course_modules cm
             LEFT JOIN activity_completion ac ON ac.module_id = cm.id AND ac.user_id = ?
            WHERE cm.course_id = ? AND cm.visible = true",
            [$userId, $courseId]
        );

        // if nothing is completion-tracked, don't auto-complete
        if ((int) $stats->tracked === 0) {
            return;
        }

        $complete = ((int) $stats->done === (int) $stats->tracked);
        $state = $complete ? 'complete' : 'inprogress';

        DB::statement(
            "INSERT INTO course_completion (tenant_id, course_id, user_id, state, completed_at)
             VALUES (?, ?, ?, ?, CASE WHEN ? = 'complete' THEN now() ELSE NULL END)
             ON CONFLICT (tenant_id, course_id, user_id) DO UPDATE SET
               state = EXCLUDED.state,
               completed_at = CASE WHEN EXCLUDED.state = 'complete' THEN now() ELSE course_completion.completed_at END",
            [$tenantId, $courseId, $userId, $state, $state]
        );

        // when a course completes, recompute any program containing it
        if ($complete) {
            // auto-issue a course certificate if one is defined for this course
            $certDef = DB::selectOne(
                "SELECT id FROM credential_definitions
                  WHERE source_type = 'course' AND source_id = ? AND active = true LIMIT 1",
                [$courseId]
            );
            if ($certDef) {
                $code = strtoupper(bin2hex(random_bytes(8)));
                DB::statement(
                    "INSERT INTO user_credentials (tenant_id, definition_id, user_id, verification_code, evidence)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT (tenant_id, definition_id, user_id) DO NOTHING",
                    [$tenantId, $certDef->id, $userId, $code, json_encode(['reason' => 'course_completed', 'course_id' => $courseId])]
                );
            }

            $programs = DB::select(
                'SELECT DISTINCT program_id FROM program_courses WHERE course_id = ?',
                [$courseId]
            );
            foreach ($programs as $p) {
                // recompute within this same tenant transaction
                $this->programs->recomputeProgressInTxPublic($tenantId, $p->program_id, $userId);
            }
        }
    }

    public function courseStatus(string $tenantId, string $courseId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId, $userId) {
            $modules = DB::select(
                'SELECT cm.id, cm.module_type, COALESCE(ac.state, 0) AS state
                   FROM course_modules cm
                   LEFT JOIN activity_completion ac ON ac.module_id = cm.id AND ac.user_id = ?
                  WHERE cm.course_id = ? AND cm.visible = true
                  ORDER BY cm.sort_order',
                [$userId, $courseId]
            );
            $course = DB::selectOne(
                'SELECT state, completed_at FROM course_completion WHERE course_id = ? AND user_id = ?',
                [$courseId, $userId]
            );

            return (object) [
                'course_state' => $course->state ?? 'inprogress',
                'completed_at' => $course->completed_at ?? null,
                'modules' => $modules,
            ];
        });
    }
}
