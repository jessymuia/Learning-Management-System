<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * StudentService — read models for the learner workspace ("learning home").
 *
 * Everything is scoped to the student's own active enrolments, so a student
 * only ever sees courses they're enrolled in. Students consume content; they
 * never create it.
 *
 * The dashboard answers a single question for the learner:
 *   "What am I learning and what should I do next?"
 *
 * overview() returns a rich payload: continue-learning, learning-progress
 * totals, pending/submitted assignments, quizzes (available + results),
 * grades/performance, forum activity, teacher announcements, certificates and
 * recent notifications. Locked (unpaid) courses never leak learning content.
 */
class StudentService
{
    /** Course ids the student is actively enrolled in. */
    private function enrolledCourseIds(string $userId): array
    {
        $rows = DB::select(
            "SELECT DISTINCT course_id FROM user_enrolments
              WHERE user_id = ? AND status = 'active'",
            [$userId]
        );

        return array_map(fn ($r) => $r->course_id, $rows);
    }

    /**
     * Of the given enrolled course ids, return those the learner can access:
     * free courses always; paid courses only after a succeeded payment on a
     * paid order. Mirrors CourseAccessService::describe().
     */
    private function unlockedCourseIds(string $userId, array $ids): array
    {
        if (empty($ids)) {
            return [];
        }
        $place = implode(',', array_fill(0, count($ids), '?'));
        $rows = DB::select(
            "SELECT c.id
               FROM courses c
              WHERE c.id IN ($place)
                AND (
                  c.is_paid = false
                  OR EXISTS (
                    SELECT 1 FROM orders o
                      JOIN payments p ON p.order_id = o.id AND p.status = 'succeeded'
                     WHERE o.user_id = ? AND o.item_id = c.id
                       AND o.item_type = 'course' AND o.status = 'paid'
                  )
                )",
            array_merge($ids, [$userId])
        );

        return array_map(fn ($r) => $r->id, $rows);
    }

    /**
     * Enrolled courses with progress %, completed/total activities, instructor,
     * lesson counts, and paid/locked state.
     *
     * Locked courses are still listed (so the learner knows they exist and can
     * pay) but the dashboard greys them out and hides "continue" actions.
     */
    public function myCourses(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            return DB::select(
                "SELECT c.id, c.shortname, c.fullname, ue.status,
                        c.is_paid, c.price_minor,
                        (SELECT COUNT(*) FROM course_modules cm
                          WHERE cm.course_id = c.id AND cm.visible = true) AS total_activities,
                        (SELECT COUNT(*) FROM activity_completion ac
                          JOIN course_modules cm ON cm.id = ac.module_id
                         WHERE cm.course_id = c.id AND ac.user_id = ? AND ac.state >= 1) AS completed_activities,
                        (SELECT COUNT(*) FROM lessons l
                          WHERE l.course_id = c.id AND l.visible = true) AS total_lessons,
                        cc.state AS completion_state,
                        (SELECT u.email FROM context_role_assignments cra
                          JOIN roles r ON r.id = cra.role_id AND r.name = 'teacher'
                          JOIN contexts ctx ON ctx.id = cra.context_id AND ctx.level = 'course' AND ctx.instance_id = c.id
                          JOIN users u ON u.id = cra.user_id LIMIT 1) AS instructor,
                        CASE WHEN c.is_paid AND NOT EXISTS (
                              SELECT 1 FROM orders o
                                JOIN payments p ON p.order_id = o.id AND p.status = 'succeeded'
                               WHERE o.user_id = ? AND o.item_id = c.id
                                 AND o.item_type = 'course' AND o.status = 'paid'
                        ) THEN true ELSE false END AS locked
                   FROM user_enrolments ue
                   JOIN courses c ON c.id = ue.course_id
                   LEFT JOIN course_completion cc ON cc.course_id = c.id AND cc.user_id = ue.user_id
                  WHERE ue.user_id = ? AND ue.status = 'active' AND c.deleted_at IS NULL
                  ORDER BY c.fullname",
                [$userId, $userId, $userId]
            );
        });
    }

    /** Headline numbers + everything the learning-home dashboard renders. */
    public function overview(string $tenantId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            $ids = $this->enrolledCourseIds($userId);
            // Only surface learning content from courses the learner can access.
            $unlockedIds = $this->unlockedCourseIds($userId, $ids);

            $enrolled = count($ids);
            $lockedCount = $enrolled - count($unlockedIds);
            $completed = (int) (DB::selectOne(
                "SELECT COUNT(*) AS c FROM course_completion
                  WHERE user_id = ? AND state = 'complete'",
                [$userId]
            )->c ?? 0);
            $certificates = (int) (DB::selectOne(
                "SELECT COUNT(*) AS c FROM user_credentials WHERE user_id = ? AND revoked_at IS NULL",
                [$userId]
            )->c ?? 0);

            $pendingAssignments = [];
            $submittedAssignments = [];
            $upcoming = [];
            $continueLearning = null;
            $quizzesAvailable = [];
            $quizResults = [];
            $forumActivity = [];
            $announcements = [];
            $progress = (object) [
                'completed_activities' => 0,
                'total_activities' => 0,
                'completed_lessons' => 0,
                'total_lessons' => 0,
                'remaining_activities' => 0,
                'course_completion_pct' => 0,
            ];

            if (! empty($unlockedIds)) {
                $place = implode(',', array_fill(0, count($unlockedIds), '?'));

                // ── ASSIGNMENTS ──────────────────────────────────────────────
                $pendingAssignments = DB::select(
                    "SELECT a.id, a.title, a.due_at, c.id AS course_id, c.fullname AS course,
                            s.state AS submission_state, s.workflow_state, s.submitted_at
                       FROM assignments a
                       JOIN courses c ON c.id = a.course_id
                       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.user_id = ?
                      WHERE a.course_id IN ($place)
                        AND (s.id IS NULL OR s.workflow_state IS DISTINCT FROM 'released')
                      ORDER BY a.due_at NULLS LAST
                      LIMIT 12",
                    array_merge([$userId], $unlockedIds)
                );

                // submitted work, with released feedback + grade (from gradebook)
                $submittedAssignments = DB::select(
                    "SELECT a.id, a.title, c.id AS course_id, c.fullname AS course,
                            s.state AS submission_state, s.workflow_state, s.submitted_at,
                            s.is_late, s.feedback,
                            gg.finalgrade AS grade, gi.grademax AS grade_max
                       FROM submissions s
                       JOIN assignments a ON a.id = s.assignment_id
                       JOIN courses c ON c.id = a.course_id
                       LEFT JOIN course_modules cm ON cm.module_type = 'assignment'
                            AND cm.instance_id = a.id
                       LEFT JOIN grade_items gi ON gi.item_type = 'mod' AND gi.module_id = cm.id
                       LEFT JOIN grade_grades gg ON gg.grade_item_id = gi.id AND gg.user_id = s.user_id
                      WHERE s.user_id = ? AND a.course_id IN ($place)
                        AND s.state IN ('submitted','graded','returned')
                      ORDER BY s.submitted_at DESC NULLS LAST
                      LIMIT 8",
                    array_merge([$userId], $unlockedIds)
                );

                // upcoming deadlines (assignments due in the future)
                $upcoming = DB::select(
                    "SELECT a.id, a.title, a.due_at, c.id AS course_id, c.fullname AS course, 'assignment' AS kind
                       FROM assignments a JOIN courses c ON c.id = a.course_id
                      WHERE a.course_id IN ($place) AND a.due_at > now()
                      ORDER BY a.due_at ASC LIMIT 6",
                    $unlockedIds
                );

                // ── QUIZZES ──────────────────────────────────────────────────
                $quizzesAvailable = DB::select(
                    "SELECT q.id, q.name, q.close_at, q.attempts_allowed, c.id AS course_id, c.fullname AS course,
                            (SELECT COUNT(*) FROM quiz_attempts qa
                              WHERE qa.quiz_id = q.id AND qa.user_id = ?) AS attempts_taken
                       FROM quizzes q
                       JOIN courses c ON c.id = q.course_id
                      WHERE q.course_id IN ($place)
                        AND (q.open_at IS NULL OR q.open_at <= now())
                        AND (q.close_at IS NULL OR q.close_at >= now())
                      ORDER BY q.close_at NULLS LAST
                      LIMIT 8",
                    array_merge([$userId], $unlockedIds)
                );

                $quizResults = DB::select(
                    "SELECT qa.id AS attempt_id, qa.attempt_no, qa.sumgrade, qa.finished_at,
                            q.id AS quiz_id, q.name AS quiz, c.fullname AS course,
                            (SELECT COALESCE(SUM(qs.maxmark), 0) FROM quiz_slots qs WHERE qs.quiz_id = q.id) AS max_mark
                       FROM quiz_attempts qa
                       JOIN quizzes q ON q.id = qa.quiz_id
                       JOIN courses c ON c.id = q.course_id
                      WHERE qa.user_id = ? AND q.course_id IN ($place)
                        AND qa.state = 'finished'
                      ORDER BY qa.finished_at DESC NULLS LAST
                      LIMIT 8",
                    array_merge([$userId], $unlockedIds)
                );

                // ── FORUMS & ANNOUNCEMENTS ───────────────────────────────────
                $forumActivity = DB::select(
                    "SELECT d.id AS discussion_id, d.subject, d.pinned, f.id AS forum_id,
                            f.name AS forum, c.id AS course_id, c.fullname AS course,
                            (SELECT COUNT(*) FROM posts p WHERE p.discussion_id = d.id) AS post_count,
                            (SELECT MAX(p.created_at) FROM posts p WHERE p.discussion_id = d.id) AS last_post_at
                       FROM discussions d
                       JOIN forums f ON f.id = d.forum_id
                       JOIN courses c ON c.id = f.course_id
                      WHERE f.course_id IN ($place)
                      ORDER BY d.pinned DESC, last_post_at DESC NULLS LAST
                      LIMIT 6",
                    $unlockedIds
                );

                $announcements = DB::select(
                    "SELECT an.id, an.subject, an.published_at, an.pinned,
                            c.id AS course_id, c.fullname AS course
                       FROM announcements an
                       JOIN courses c ON c.id = an.course_id
                      WHERE an.course_id IN ($place)
                      ORDER BY an.pinned DESC, an.published_at DESC
                      LIMIT 6",
                    $unlockedIds
                );

                // ── LEARNING PROGRESS (aggregate across unlocked courses) ────
                $aPlace = implode(',', array_fill(0, count($unlockedIds), '?'));
                $progRow = DB::selectOne(
                    "SELECT
                        (SELECT COUNT(*) FROM course_modules cm
                          WHERE cm.course_id IN ($aPlace) AND cm.visible = true) AS total_activities,
                        (SELECT COUNT(*) FROM activity_completion ac
                          JOIN course_modules cm ON cm.id = ac.module_id
                         WHERE cm.course_id IN ($aPlace) AND ac.user_id = ? AND ac.state >= 1) AS completed_activities,
                        (SELECT COUNT(*) FROM lessons l
                          WHERE l.course_id IN ($aPlace) AND l.visible = true) AS total_lessons",
                    array_merge($unlockedIds, $unlockedIds, [$userId], $unlockedIds)
                );
                $totalAct = (int) ($progRow->total_activities ?? 0);
                $doneAct = (int) ($progRow->completed_activities ?? 0);
                $totalLessons = (int) ($progRow->total_lessons ?? 0);
                $completedLessons = $totalAct > 0
                    ? (int) round($totalLessons * ($doneAct / $totalAct))
                    : 0;
                $progress = (object) [
                    'completed_activities' => $doneAct,
                    'total_activities' => $totalAct,
                    'completed_lessons' => $completedLessons,
                    'total_lessons' => $totalLessons,
                    'remaining_activities' => max(0, $totalAct - $doneAct),
                    'course_completion_pct' => $totalAct > 0 ? (int) round(($doneAct / $totalAct) * 100) : 0,
                ];

                // ── CONTINUE LEARNING ────────────────────────────────────────
                $recent = DB::selectOne(
                    "SELECT c.id AS course_id, c.fullname AS course
                       FROM activity_completion ac
                       JOIN course_modules cm ON cm.id = ac.module_id
                       JOIN courses c ON c.id = cm.course_id
                      WHERE ac.user_id = ? AND cm.course_id IN ($place)
                      ORDER BY ac.completed_at DESC NULLS LAST LIMIT 1",
                    array_merge([$userId], $unlockedIds)
                );
                $focusCourse = $recent->course_id ?? $unlockedIds[0];
                $focusName = $recent->course ?? (DB::selectOne(
                    'SELECT fullname FROM courses WHERE id = ?', [$focusCourse]
                )->fullname ?? 'Your course');

                $nextActivity = DB::selectOne(
                    "SELECT ca.title, cm.module_type
                       FROM course_modules cm
                       LEFT JOIN content_activities ca ON ca.id = cm.instance_id
                       LEFT JOIN activity_completion ac ON ac.module_id = cm.id AND ac.user_id = ?
                      WHERE cm.course_id = ? AND cm.visible = true
                        AND (ac.state IS NULL OR ac.state = 0)
                      ORDER BY cm.sort_order LIMIT 1",
                    [$userId, $focusCourse]
                );

                $lastLesson = DB::selectOne(
                    "SELECT ca.title
                       FROM activity_completion ac
                       JOIN course_modules cm ON cm.id = ac.module_id
                       LEFT JOIN content_activities ca ON ca.id = cm.instance_id
                      WHERE ac.user_id = ? AND cm.course_id = ? AND ac.state >= 1
                      ORDER BY ac.completed_at DESC NULLS LAST LIMIT 1",
                    [$userId, $focusCourse]
                );

                $focusProg = DB::selectOne(
                    "SELECT
                        (SELECT COUNT(*) FROM course_modules cm WHERE cm.course_id = ? AND cm.visible = true) AS total,
                        (SELECT COUNT(*) FROM activity_completion ac
                          JOIN course_modules cm ON cm.id = ac.module_id
                         WHERE cm.course_id = ? AND ac.user_id = ? AND ac.state >= 1) AS done",
                    [$focusCourse, $focusCourse, $userId]
                );
                $fTotal = (int) ($focusProg->total ?? 0);
                $fDone = (int) ($focusProg->done ?? 0);

                $continueLearning = (object) [
                    'course_id' => $focusCourse,
                    'course' => $focusName,
                    'last_lesson' => $lastLesson->title ?? null,
                    'next_activity' => $nextActivity->title ?? null,
                    'next_type' => $nextActivity->module_type ?? null,
                    'progress_pct' => $fTotal > 0 ? (int) round(($fDone / $fTotal) * 100) : 0,
                ];
            }

            // ── NOTIFICATIONS (recent, with unread count) ────────────────────
            $notifications = DB::select(
                "SELECT id, type, payload, read_at, created_at
                   FROM notifications
                  WHERE user_id = ?
                  ORDER BY created_at DESC
                  LIMIT 6",
                [$userId]
            );
            $unreadNotifications = (int) (DB::selectOne(
                "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL",
                [$userId]
            )->c ?? 0);

            return (object) [
                'enrolled_courses' => $enrolled,
                'completed_courses' => $completed,
                'locked_courses' => $lockedCount,
                'pending_assignments' => count($pendingAssignments),
                'certificates' => $certificates,
                'continue_learning' => $continueLearning,
                'progress' => $progress,
                'pending' => $pendingAssignments,
                'submitted' => $submittedAssignments,
                'upcoming' => $upcoming,
                'quizzes_available' => $quizzesAvailable,
                'quiz_results' => $quizResults,
                'forums' => $forumActivity,
                'announcements' => $announcements,
                'notifications' => $notifications,
                'unread_notifications' => $unreadNotifications,
            ];
        });
    }
}
