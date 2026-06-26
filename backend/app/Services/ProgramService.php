<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * ProgramService — packaged learning paths / nanodegrees (spec §2.8, §7.7).
 *
 * A program bundles N courses (required|elective), is enrolled in as a unit,
 * and issues a credential on completion. Completion is event-driven and
 * recomputed into the denormalized program_progress read model — the same
 * pattern as the gradebook summary. Same TenantContext / API-first style.
 */
class ProgramService
{
    public function create(string $tenantId, array $data): object
    {
        foreach (['slug', 'title'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            try {
                return DB::selectOne(
                    "INSERT INTO programs (tenant_id, slug, title, status, min_electives, credential, pricing, settings)
                     VALUES (?, ?, ?, COALESCE(?,'draft'), COALESCE(?,0), COALESCE(?,'{}'::jsonb), '{}'::jsonb, '{}'::jsonb)
                     RETURNING id, slug, title, status, min_electives",
                    [
                        $tenantId, $data['slug'], $data['title'], $data['status'] ?? null,
                        $data['minElectives'] ?? null,
                        isset($data['credential']) ? json_encode($data['credential']) : null,
                    ]
                );
            } catch (\Illuminate\Database\QueryException $e) {
                if ($e->getCode() === '23505') {
                    throw new HttpException(409, 'Program slug already taken');
                }
                throw $e;
            }
        });
    }

    public function list(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () {
            return DB::select(
                'SELECT id, slug, title, status, min_electives, created_at FROM programs ORDER BY created_at DESC'
            );
        });
    }

    /** Attach a course to a program as required or elective. */
    public function addCourse(string $tenantId, string $programId, array $data): object
    {
        if (empty($data['courseId'])) {
            throw new HttpException(400, 'courseId is required');
        }
        // schema rule: an elective course must belong to an elective_group
        if (($data['requirement'] ?? 'required') === 'elective' && empty($data['electiveGroup'])) {
            throw new HttpException(400, 'electiveGroup is required for elective courses');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $programId, $data) {
            $prog = DB::selectOne('SELECT id FROM programs WHERE id = ?', [$programId]);
            if (! $prog) {
                throw new HttpException(404, 'Program not found');
            }

            try {
                return DB::selectOne(
                    "INSERT INTO program_courses
                       (tenant_id, program_id, course_id, requirement, elective_group, sort_order, unlock_rule)
                     VALUES (?, ?, ?, COALESCE(?,'required'), ?, COALESCE(?,0), ?)
                     RETURNING id, course_id, requirement, elective_group, sort_order",
                    [
                        $tenantId, $programId, $data['courseId'],
                        $data['requirement'] ?? null, $data['electiveGroup'] ?? null,
                        $data['sortOrder'] ?? null,
                        isset($data['unlockRule']) ? json_encode($data['unlockRule']) : null,
                    ]
                );
            } catch (\Illuminate\Database\QueryException $e) {
                if ($e->getCode() === '23505') {
                    throw new HttpException(409, 'Course already in this program');
                }
                throw $e;
            }
        });
    }

    /** Enrol a user in a program (distinct from course enrolment). */
    public function enrol(string $tenantId, string $programId, string $userId, ?string $cohortId = null): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $programId, $userId, $cohortId) {
            $prog = DB::selectOne('SELECT id FROM programs WHERE id = ?', [$programId]);
            if (! $prog) {
                throw new HttpException(404, 'Program not found');
            }

            $enrolment = DB::selectOne(
                "INSERT INTO program_enrolments (tenant_id, program_id, user_id, status, cohort_id)
                 VALUES (?, ?, ?, 'active', ?)
                 ON CONFLICT (tenant_id, program_id, user_id) DO UPDATE SET status='active'
                 RETURNING id, program_id, user_id, status, started_at",
                [$tenantId, $programId, $userId, $cohortId]
            );

            // initialise progress row
            $this->recomputeProgressInTx($tenantId, $programId, $userId);

            return $enrolment;
        });
    }

    /**
     * Recompute a user's program progress (public entry — opens its own tx).
     * Call this when a constituent course completes. Idempotent; issues the
     * credential and flips status to completed on first satisfaction.
     */
    public function recomputeProgress(string $tenantId, string $programId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $programId, $userId) {
            return $this->recomputeProgressInTx($tenantId, $programId, $userId);
        });
    }

    /** In-transaction recompute (callable from CompletionService, which already
     *  holds an open tenant transaction). Avoids nesting transactions. */
    public function recomputeProgressInTxPublic(string $tenantId, string $programId, string $userId): object
    {
        return $this->recomputeProgressInTx($tenantId, $programId, $userId);
    }

    /** The actual recompute, assumes an open tenant transaction. */
    private function recomputeProgressInTx(string $tenantId, string $programId, string $userId): object
    {
        // required courses in the program
        $required = DB::select(
            "SELECT course_id FROM program_courses
              WHERE program_id = ? AND requirement = 'required'",
            [$programId]
        );
        $electives = DB::select(
            "SELECT course_id FROM program_courses
              WHERE program_id = ? AND requirement = 'elective'",
            [$programId]
        );
        $program = DB::selectOne('SELECT min_electives FROM programs WHERE id = ?', [$programId]);
        $minElectives = $program->min_electives ?? 0;

        // a course is "complete" for a user when course_completion says so
        $isComplete = function (string $courseId) use ($userId): bool {
            $row = DB::selectOne(
                "SELECT 1 AS done FROM course_completion
                  WHERE course_id = ? AND user_id = ? AND state = 'complete'",
                [$courseId, $userId]
            );

            return (bool) $row;
        };

        $reqTotal = count($required);
        $reqDone = 0;
        foreach ($required as $r) {
            if ($isComplete($r->course_id)) {
                $reqDone++;
            }
        }
        $elecDone = 0;
        foreach ($electives as $e) {
            if ($isComplete($e->course_id)) {
                $elecDone++;
            }
        }

        $requiredSatisfied = ($reqDone >= $reqTotal);
        $electivesSatisfied = ($elecDone >= $minElectives);
        $complete = $requiredSatisfied && $electivesSatisfied;

        // percent: required + min electives is the denominator
        $denom = $reqTotal + $minElectives;
        $numer = $reqDone + min($elecDone, $minElectives);
        $percent = $denom > 0 ? round(($numer / $denom) * 100, 2) : ($complete ? 100 : 0);

        $state = $complete ? 'completed' : 'inprogress';

        $row = DB::selectOne(
            "INSERT INTO program_progress
               (tenant_id, program_id, user_id, required_total, required_completed,
                electives_completed, percent, state, computed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())
             ON CONFLICT (tenant_id, program_id, user_id) DO UPDATE SET
               required_total = EXCLUDED.required_total,
               required_completed = EXCLUDED.required_completed,
               electives_completed = EXCLUDED.electives_completed,
               percent = EXCLUDED.percent,
               state = EXCLUDED.state,
               computed_at = now()
             RETURNING program_id, user_id, required_total, required_completed,
                       electives_completed, percent, state",
            [$tenantId, $programId, $userId, $reqTotal, $reqDone, $elecDone, $percent, $state]
        );

        // on first completion: issue credential + flip enrolment (idempotent)
        if ($complete) {
            $already = DB::selectOne(
                'SELECT credential_issued_at FROM program_progress WHERE program_id = ? AND user_id = ?',
                [$programId, $userId]
            );
            if (! $already || ! $already->credential_issued_at) {
                $this->issueCredentialIfAny($tenantId, $programId, $userId);
                DB::statement(
                    'UPDATE program_progress SET credential_issued_at = now() WHERE program_id = ? AND user_id = ?',
                    [$programId, $userId]
                );
                DB::statement(
                    "UPDATE program_enrolments SET status='completed', completed_at=now()
                      WHERE program_id = ? AND user_id = ?",
                    [$programId, $userId]
                );
            }
        }

        return $row;
    }

    private function issueCredentialIfAny(string $tenantId, string $programId, string $userId): void
    {
        $def = DB::selectOne(
            "SELECT id FROM credential_definitions
              WHERE source_type = 'program' AND source_id = ? LIMIT 1",
            [$programId]
        );
        if (! $def) {
            return; // no credential configured for this program
        }
        DB::statement(
            "INSERT INTO user_credentials (tenant_id, definition_id, user_id, verification_code, evidence)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (tenant_id, definition_id, user_id) DO NOTHING",
            [
                $tenantId, $def->id, $userId,
                strtoupper(substr(bin2hex(random_bytes(8)), 0, 12)),
                json_encode(['program_id' => $programId, 'issued_for' => 'program_completion']),
            ]
        );
    }

    public function getProgress(string $tenantId, string $programId, string $userId): ?object
    {
        return TenantContext::withTenant($tenantId, function () use ($programId, $userId) {
            return DB::selectOne(
                'SELECT program_id, user_id, required_total, required_completed,
                        electives_completed, percent, state, credential_issued_at
                   FROM program_progress WHERE program_id = ? AND user_id = ?',
                [$programId, $userId]
            );
        });
    }

    /** Units (courses) in a program, with whether each is shared across programs. */
    public function listCourses(string $tenantId, string $programId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($programId) {
            return DB::select(
                'SELECT c.id, c.shortname, c.fullname, pc.requirement, pc.elective_group,
                        (SELECT COUNT(*) FROM program_courses pc2 WHERE pc2.course_id = c.id) AS in_programs
                   FROM program_courses pc JOIN courses c ON c.id = pc.course_id
                  WHERE pc.program_id = ? ORDER BY pc.sort_order, c.fullname',
                [$programId]
            );
        });
    }
}
