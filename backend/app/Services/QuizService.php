<?php

namespace App\Services;

use App\Services\GradebookService;
use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * QuizService — question bank (versioned), quizzes, and the server-authoritative
 * attempt state machine. Same style as Modules 1-2: TenantContext::withTenant
 * wraps every tenant-scoped operation so RLS is enforced.
 *
 * Attempt state machine (spec §6.2), all transitions server-enforced:
 *   inprogress → (overdue) → finished
 *             ↘ abandoned
 */
class QuizService
{
    public function __construct(private QuestionGradingService $grader, private GradebookService $gradebook) {}

    // ── Question bank ───────────────────────────────────────────────────────
    public function createQuestion(string $tenantId, array $data): object
    {
        foreach (['categoryId', 'qtype', 'questiontext'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            // create the question shell
            $q = DB::selectOne(
                'INSERT INTO questions (tenant_id, category_id, qtype) VALUES (?, ?, ?) RETURNING id',
                [$tenantId, $data['categoryId'], $data['qtype']]
            );
            // create version 1
            $v = DB::selectOne(
                "INSERT INTO question_versions
                   (tenant_id, question_id, version, status, questiontext, defaultmark, data)
                 VALUES (?, ?, 1, 'ready', ?, COALESCE(?,1), ?) RETURNING id",
                [
                    $tenantId, $q->id, json_encode($data['questiontext']),
                    $data['defaultmark'] ?? null, json_encode($data['data'] ?? (object) []),
                ]
            );
            // point question at its current version
            DB::statement('UPDATE questions SET current_version_id = ? WHERE id = ?', [$v->id, $q->id]);

            return DB::selectOne(
                'SELECT q.id, q.qtype, q.current_version_id, qv.version
                   FROM questions q JOIN question_versions qv ON qv.id = q.current_version_id
                  WHERE q.id = ?',
                [$q->id]
            );
        });
    }

    /**
     * Edit a question by creating a NEW immutable version (never mutate the old
     * one — that's what makes historical attempts regradeable). Spec §6.1.
     */

    /** Create (or fetch) a question-bank category for a course. */
    public function createCategory(string $tenantId, array $data): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                'INSERT INTO question_categories (tenant_id, course_id, name)
                 VALUES (?, ?, ?) RETURNING id, course_id, name',
                [$tenantId, $data['courseId'], $data['name']]
            );
        });
    }

    /** List question-bank categories (optionally for one course). */
    public function listCategories(string $tenantId, ?string $courseId = null): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            if ($courseId) {
                return DB::select('SELECT id, course_id, name FROM question_categories WHERE course_id = ? ORDER BY name', [$courseId]);
            }
            return DB::select('SELECT id, course_id, name FROM question_categories ORDER BY name');
        });
    }

    public function addQuestionVersion(string $tenantId, string $questionId, array $data): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $questionId, $data) {
            $q = DB::selectOne('SELECT id FROM questions WHERE id = ?', [$questionId]);
            if (! $q) {
                throw new HttpException(404, 'Question not found');
            }
            $next = DB::selectOne(
                'SELECT COALESCE(MAX(version),0) + 1 AS v FROM question_versions WHERE question_id = ?',
                [$questionId]
            );
            $v = DB::selectOne(
                "INSERT INTO question_versions
                   (tenant_id, question_id, version, status, questiontext, defaultmark, data)
                 VALUES (?, ?, ?, 'ready', ?, COALESCE(?,1), ?) RETURNING id, version",
                [
                    $tenantId, $questionId, $next->v, json_encode($data['questiontext'] ?? ''),
                    $data['defaultmark'] ?? null, json_encode($data['data'] ?? (object) []),
                ]
            );
            DB::statement('UPDATE questions SET current_version_id = ? WHERE id = ?', [$v->id, $questionId]);

            return $v;
        });
    }

    // ── Quizzes ─────────────────────────────────────────────────────────────
    public function createQuiz(string $tenantId, array $data): object
    {
        foreach (['courseId', 'name'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                "INSERT INTO quizzes
                   (tenant_id, course_id, name, intro, open_at, close_at, time_limit_s,
                    attempts_allowed, grade_method, navigation, behaviour, shuffle, grace_period_s)
                 VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?,0), COALESCE(?,'highest'),
                         COALESCE(?,'free'), COALESCE(?,'deferred'), COALESCE(?,true), COALESCE(?,0))
                 RETURNING id, course_id, name, time_limit_s, attempts_allowed, grade_method, navigation, behaviour",
                [
                    $tenantId, $data['courseId'], $data['name'],
                    isset($data['intro']) ? json_encode($data['intro']) : null,
                    $data['openAt'] ?? null, $data['closeAt'] ?? null, $data['timeLimitS'] ?? null,
                    $data['attemptsAllowed'] ?? null, $data['gradeMethod'] ?? null,
                    $data['navigation'] ?? null, $data['behaviour'] ?? null,
                    $data['shuffle'] ?? null, $data['gracePeriodS'] ?? null,
                ]
            );
        });
    }

    /** Add a question to a quiz as a slot. */
    public function addSlot(string $tenantId, string $quizId, array $data): object
    {
        if (empty($data['questionId'])) {
            throw new HttpException(400, 'questionId is required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $quizId, $data) {
            $next = DB::selectOne(
                'SELECT COALESCE(MAX(slot_num),0) + 1 AS n FROM quiz_slots WHERE quiz_id = ?',
                [$quizId]
            );

            return DB::selectOne(
                'INSERT INTO quiz_slots (tenant_id, quiz_id, slot_num, question_id, maxmark)
                 VALUES (?, ?, ?, ?, COALESCE(?,1)) RETURNING id, slot_num, question_id, maxmark',
                [$tenantId, $quizId, $next->n, $data['questionId'], $data['maxmark'] ?? null]
            );
        });
    }

    // ── Attempt state machine (server-authoritative) ────────────────────────

    /**
     * Start an attempt. Enforces attempts_allowed and the one-live-attempt rule
     * (the DB partial unique index also guards this). Sets the server-side
     * due_at from the quiz time limit — the client clock is never trusted.
     */
    public function startAttempt(string $tenantId, string $quizId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $quizId, $userId) {
            $quiz = DB::selectOne(
                'SELECT id, time_limit_s, attempts_allowed, close_at FROM quizzes WHERE id = ?',
                [$quizId]
            );
            if (! $quiz) {
                throw new HttpException(404, 'Quiz not found');
            }

            // count prior attempts
            $count = DB::selectOne(
                'SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?',
                [$quizId, $userId]
            );
            if ($quiz->attempts_allowed > 0 && $count->c >= $quiz->attempts_allowed) {
                throw new HttpException(409, 'No attempts remaining');
            }

            // server-authoritative deadline = min(now + limit, close_at)
            $attemptNo = $count->c + 1;
            try {
                return DB::selectOne(
                    "INSERT INTO quiz_attempts (tenant_id, quiz_id, user_id, attempt_no, state, started_at, due_at)
                     VALUES (?, ?, ?, ?, 'inprogress', now(),
                       LEAST(
                         CASE WHEN ? IS NOT NULL THEN now() + (? || ' seconds')::interval END,
                         ?::timestamptz
                       ))
                     RETURNING id, quiz_id, user_id, attempt_no, state, started_at, due_at",
                    [
                        $tenantId, $quizId, $userId, $attemptNo,
                        $quiz->time_limit_s, $quiz->time_limit_s, $quiz->close_at,
                    ]
                );
            } catch (\Illuminate\Database\QueryException $e) {
                if ($e->getCode() === '23505') {
                    throw new HttpException(409, 'You already have an attempt in progress');
                }
                throw $e;
            }
        });
    }

    /**
     * Record an interaction step (autosave/submit) — append-only.
     * Pins the question_version_id so a later regrade is deterministic.
     */
    public function recordStep(string $tenantId, string $attemptId, array $data): object
    {
        foreach (['questionVersionId', 'slotNum', 'action', 'state'] as $req) {
            if (! isset($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $attemptId, $data) {
            // verify attempt is live and not past due (server-authoritative)
            $att = DB::selectOne(
                'SELECT id, state, due_at FROM quiz_attempts WHERE id = ?',
                [$attemptId]
            );
            if (! $att) {
                throw new HttpException(404, 'Attempt not found');
            }
            if (! in_array($att->state, ['inprogress', 'overdue'], true)) {
                throw new HttpException(409, 'Attempt is not open');
            }

            // Server-authoritative timer (audit §4.2): reject steps past the
            // deadline (30s grace for clock skew) and mark the attempt overdue.
            if ($att->due_at !== null) {
                $expired = DB::selectOne(
                    "SELECT (now() > (?::timestamptz + interval '30 seconds')) AS past",
                    [$att->due_at]
                );
                if ($expired && $expired->past) {
                    DB::statement("UPDATE quiz_attempts SET state = 'overdue' WHERE id = ? AND state = 'inprogress'", [$attemptId]);
                    throw new HttpException(409, 'Time is up: this attempt has passed its deadline.');
                }
            }

            $next = DB::selectOne(
                'SELECT COALESCE(MAX(seq),0) + 1 AS s FROM attempt_steps WHERE attempt_id = ?',
                [$attemptId]
            );

            return DB::selectOne(
                'INSERT INTO attempt_steps
                   (tenant_id, attempt_id, question_version_id, slot_num, seq, action, state, response, fraction)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id, slot_num, seq, action, state, fraction',
                [
                    $tenantId, $attemptId, $data['questionVersionId'], $data['slotNum'],
                    $next->s, $data['action'], $data['state'],
                    isset($data['response']) ? json_encode($data['response']) : null,
                    $data['fraction'] ?? null,
                ]
            );
        });
    }

    /**
     * Finish an attempt. Server computes the sum grade from the latest graded
     * step per slot. Transition inprogress|overdue → finished.
     */
    public function finishAttempt(string $tenantId, string $attemptId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $attemptId) {
            $att = DB::selectOne(
                'SELECT qa.id, qa.state, qa.quiz_id, qa.user_id, qa.due_at,
                        q.course_id, q.name, q.grade_method
                   FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
                  WHERE qa.id = ?',
                [$attemptId]
            );
            if (! $att) {
                throw new HttpException(404, 'Attempt not found');
            }
            if (! in_array($att->state, ['inprogress', 'overdue'], true)) {
                throw new HttpException(409, 'Attempt is not open');
            }

            // sum the latest fraction*maxmark per slot from the steps
            $sum = DB::selectOne(
                "WITH latest AS (
                   SELECT DISTINCT ON (slot_num) slot_num, fraction
                     FROM attempt_steps
                    WHERE attempt_id = ? AND fraction IS NOT NULL
                    ORDER BY slot_num, seq DESC
                 )
                 SELECT COALESCE(SUM(l.fraction * qs.maxmark), 0) AS total
                   FROM latest l
                   JOIN quiz_attempts qa ON qa.id = ?
                   JOIN quiz_slots qs ON qs.quiz_id = qa.quiz_id AND qs.slot_num = l.slot_num",
                [$attemptId, $attemptId]
            );

            $finished = DB::selectOne(
                "UPDATE quiz_attempts
                    SET state = 'finished', finished_at = now(), sumgrade = ?
                  WHERE id = ?
                  RETURNING id, state, finished_at, sumgrade",
                [$sum->total, $attemptId]
            );

            // Resolve the quiz's grade across attempts per grade_method (audit §3.7),
            // then mirror into the gradebook (audit §3.1).
            $agg = DB::selectOne(
                "SELECT
                   MAX(sumgrade) AS highest,
                   AVG(sumgrade) AS average,
                   (array_agg(sumgrade ORDER BY attempt_no ASC))[1] AS first,
                   (array_agg(sumgrade ORDER BY attempt_no DESC))[1] AS last,
                   (SELECT COALESCE(SUM(qs.maxmark),0) FROM quiz_slots qs WHERE qs.quiz_id = ?) AS maxgrade
                 FROM quiz_attempts
                WHERE quiz_id = ? AND user_id = ? AND state = 'finished'",
                [$att->quiz_id, $att->quiz_id, $att->user_id]
            );
            $resolved = match ($att->grade_method) {
                'average' => $agg->average,
                'first' => $agg->first,
                'last' => $agg->last,
                default => $agg->highest,
            };
            $this->gradebook->recordModuleGrade(
                $tenantId, $att->course_id, 'quiz', $att->quiz_id,
                $att->name ?? 'Quiz', $att->user_id,
                $resolved !== null ? (float) $resolved : null,
                (float) ($agg->maxgrade ?: 100), null, 'quiz'
            );

            return $finished;
        });
    }

    public function listAttempts(string $tenantId, string $quizId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($quizId, $userId) {
            return DB::select(
                'SELECT id, attempt_no, state, started_at, due_at, finished_at, sumgrade
                   FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? ORDER BY attempt_no',
                [$quizId, $userId]
            );
        });
    }

    /**
     * Server-side auto-grade a response for a slot, returning the fraction.
     * Looks up the pinned question version's qtype + answer key; objective
     * types are graded here, essays return null (manual). This is what makes
     * the timer/grading server-authoritative — the client never sends a score.
     */
    public function autoGradeResponse(string $tenantId, string $questionVersionId, $response): ?float
    {
        return TenantContext::withTenant($tenantId, function () use ($questionVersionId, $response) {
            $row = DB::selectOne(
                'SELECT q.qtype, qv.data
                   FROM question_versions qv
                   JOIN questions q ON q.id = qv.question_id
                  WHERE qv.id = ?',
                [$questionVersionId]
            );
            if (! $row) {
                return null;
            }
            $data = is_string($row->data) ? json_decode($row->data, true) : (array) $row->data;

            return $this->grader->grade($row->qtype, $data ?? [], $response);
        });
    }

}