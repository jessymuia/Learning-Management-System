<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * TeacherService — read models for the teacher workspace. Everything is scoped
 * to the courses the teacher is actually assigned to (course-context role
 * assignment with role teacher/ta), so a teacher never sees another teacher's
 * courses or org-wide data. Teachers do NOT create courses — that's the
 * manager's job; this service is delivery + monitoring only.
 */
class TeacherService
{
    /** Course ids this user teaches (course-context teacher/ta assignment). */
    private function assignedCourseIds(string $userId): array
    {
        $rows = DB::select(
            "SELECT DISTINCT ctx.instance_id AS course_id
               FROM context_role_assignments cra
               JOIN roles r ON r.id = cra.role_id AND r.name IN ('teacher','ta')
               JOIN contexts ctx ON ctx.id = cra.context_id AND ctx.level = 'course'
              WHERE cra.user_id = ?",
            [$userId]
        );

        return array_map(fn ($r) => $r->course_id, $rows);
    }

    /** Assigned courses with per-course student count, progress, last activity. */
    public function myCourses(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            $ids = $this->assignedCourseIds($userId);
            if (empty($ids)) {
                return [];
            }
            $place = implode(',', array_fill(0, count($ids), '?'));

            return DB::select(
                "SELECT c.id, c.shortname, c.fullname, c.status,
                        (SELECT COUNT(*) FROM user_enrolments ue
                          WHERE ue.course_id = c.id AND ue.status = 'active') AS students,
                        (SELECT COUNT(*) FROM course_completion cc
                          WHERE cc.course_id = c.id AND cc.state = 'complete') AS completed,
                        (SELECT COUNT(*) FROM course_modules cm
                          WHERE cm.course_id = c.id AND cm.visible = true) AS total_activities,
                        (SELECT COUNT(*) FROM submissions s
                          JOIN assignments a ON a.id = s.assignment_id
                         WHERE a.course_id = c.id AND s.state = 'submitted'
                           AND (s.workflow_state IS NULL OR s.workflow_state <> 'released')) AS pending_grading,
                        (SELECT MAX(ac.completed_at) FROM activity_completion ac
                          JOIN course_modules cm ON cm.id = ac.module_id
                         WHERE cm.course_id = c.id) AS last_activity,
                        (SELECT ROUND(AVG(gs.course_total_pct)::numeric, 1)
                           FROM gradebook_summary gs WHERE gs.course_id = c.id) AS avg_grade_pct,
                        (SELECT COUNT(*) FROM forums f WHERE f.course_id = c.id) AS forum_count
                   FROM courses c
                  WHERE c.id IN ($place) AND c.deleted_at IS NULL
                  ORDER BY c.fullname",
                $ids
            );
        });
    }

    /** Dashboard headline numbers + pending-grading queue across assigned courses. */
    public function overview(string $tenantId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            $ids = $this->assignedCourseIds($userId);
            if (empty($ids)) {
                return (object) [
                    'assigned_courses' => 0, 'total_students' => 0, 'pending_grading' => 0,
                    'active_forums' => 0, 'completed_grading' => 0,
                    'pending' => [], 'recent_submissions' => [],
                    'pending_quiz_reviews' => [], 'course_forums' => [],
                    'student_questions' => [],
                ];
            }
            $place = implode(',', array_fill(0, count($ids), '?'));

            $students = DB::selectOne(
                "SELECT COUNT(DISTINCT ue.user_id) AS c FROM user_enrolments ue
                  WHERE ue.course_id IN ($place) AND ue.status = 'active'",
                $ids
            );

            // submissions awaiting grading (submitted, not yet released)
            $pendingCount = DB::selectOne(
                "SELECT COUNT(*) AS c
                   FROM submissions s JOIN assignments a ON a.id = s.assignment_id
                  WHERE a.course_id IN ($place)
                    AND s.state = 'submitted'
                    AND (s.workflow_state IS NULL OR s.workflow_state <> 'released')",
                $ids
            );
            $completedCount = DB::selectOne(
                "SELECT COUNT(*) AS c
                   FROM submissions s JOIN assignments a ON a.id = s.assignment_id
                  WHERE a.course_id IN ($place) AND s.workflow_state = 'released'",
                $ids
            );
            $forums = DB::selectOne(
                "SELECT COUNT(*) AS c FROM forums WHERE course_id IN ($place)",
                $ids
            );

            // pending-grading detail list (most recent first)
            $pending = DB::select(
                "SELECT s.id AS submission_id, a.id AS assignment_id, a.title,
                        u.email AS student, s.submitted_at, s.is_late, c.fullname AS course
                   FROM submissions s
                   JOIN assignments a ON a.id = s.assignment_id
                   JOIN courses c ON c.id = a.course_id
                   JOIN users u ON u.id = s.user_id
                  WHERE a.course_id IN ($place)
                    AND s.state = 'submitted'
                    AND (s.workflow_state IS NULL OR s.workflow_state <> 'released')
                  ORDER BY s.submitted_at DESC NULLS LAST
                  LIMIT 8",
                $ids
            );

            return (object) [
                'assigned_courses' => count($ids),
                'total_students' => (int) $students->c,
                'pending_grading' => (int) $pendingCount->c,
                'completed_grading' => (int) $completedCount->c,
                'active_forums' => (int) $forums->c,
                'pending' => $pending,
                'pending_quiz_reviews' => $this->pendingQuizReviews($ids),
                'course_forums' => $this->forumsForCourses($ids),
                'student_questions' => $this->studentQuestions($ids),
            ];
        });
    }

    /** Students in the teacher's assigned courses, with progress + grade. */
    public function students(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            $ids = $this->assignedCourseIds($userId);
            if (empty($ids)) {
                return [];
            }
            $place = implode(',', array_fill(0, count($ids), '?'));

            return DB::select(
                "SELECT u.id, u.email, c.fullname AS course, c.id AS course_id,
                        ue.status,
                        COALESCE(gs.course_total_pct, 0) AS grade_pct,
                        CASE WHEN cc.state = 'complete' THEN true ELSE false END AS completed,
                        (SELECT COUNT(*) FROM activity_completion ac
                          JOIN course_modules cm ON cm.id = ac.module_id
                         WHERE cm.course_id = c.id AND ac.user_id = ue.user_id AND ac.state >= 1) AS done_activities,
                        (SELECT COUNT(*) FROM course_modules cm
                          WHERE cm.course_id = c.id AND cm.visible = true) AS total_activities
                   FROM user_enrolments ue
                   JOIN users u ON u.id = ue.user_id
                   JOIN courses c ON c.id = ue.course_id
                   LEFT JOIN gradebook_summary gs ON gs.course_id = ue.course_id AND gs.user_id = ue.user_id
                   LEFT JOIN course_completion cc ON cc.course_id = ue.course_id AND cc.user_id = ue.user_id
                  WHERE ue.course_id IN ($place) AND ue.status = 'active'
                  ORDER BY c.fullname, u.email
                  LIMIT 100",
                $ids
            );
        });
    }

    /** Finished quiz attempts in assigned courses (for teacher review). */
    private function pendingQuizReviews(array $courseIds): array
    {
        if (empty($courseIds)) return [];
        $place = implode(',', array_fill(0, count($courseIds), '?'));

        return DB::select(
            "SELECT qa.id AS attempt_id, q.id AS quiz_id, q.name AS quiz_title,
                    u.email AS student, qa.sumgrade, qa.finished_at, c.fullname AS course
               FROM quiz_attempts qa
               JOIN quizzes q ON q.id = qa.quiz_id
               JOIN courses c ON c.id = q.course_id
               JOIN users u ON u.id = qa.user_id
              WHERE q.course_id IN ($place) AND qa.state = 'finished'
              ORDER BY qa.finished_at DESC NULLS LAST
              LIMIT 6",
            $courseIds
        );
    }

    /**
     * Unanswered student questions in Q&A forums across assigned courses.
     * A discussion counts as a question awaiting the teacher when it lives in a
     * 'qanda' forum and has no post flagged as an accepted answer yet.
     */
    private function studentQuestions(array $courseIds): array
    {
        if (empty($courseIds)) return [];
        $place = implode(',', array_fill(0, count($courseIds), '?'));

        return DB::select(
            "SELECT d.id AS discussion_id, d.subject, f.id AS forum_id, f.name AS forum,
                    c.fullname AS course, c.id AS course_id, u.email AS student,
                    d.created_at,
                    (SELECT COUNT(*) FROM posts p WHERE p.discussion_id = d.id) AS post_count
               FROM discussions d
               JOIN forums f ON f.id = d.forum_id AND f.type = 'qanda'
               JOIN courses c ON c.id = f.course_id
               LEFT JOIN users u ON u.id = d.author_id
              WHERE f.course_id IN ($place)
                AND NOT EXISTS (
                  SELECT 1 FROM posts p WHERE p.discussion_id = d.id AND p.is_answer = true
                )
              ORDER BY d.created_at DESC
              LIMIT 8",
            $courseIds
        );
    }

    /** Forums belonging to the teacher's assigned courses. */
    private function forumsForCourses(array $courseIds): array
    {
        if (empty($courseIds)) return [];
        $place = implode(',', array_fill(0, count($courseIds), '?'));

        return DB::select(
            "SELECT f.id, f.name, f.type, c.fullname AS course, c.id AS course_id,
                    (SELECT COUNT(*) FROM discussions d WHERE d.forum_id = f.id) AS discussion_count
               FROM forums f
               JOIN courses c ON c.id = f.course_id
              WHERE f.course_id IN ($place)
              ORDER BY discussion_count DESC
              LIMIT 8",
            $courseIds
        );
    }
}
