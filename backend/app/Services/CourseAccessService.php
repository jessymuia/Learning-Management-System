<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CourseAccessService — single source of truth for "can this user access the
 * learning content of this course?". Used to gate every content endpoint
 * (sections, lessons, modules, files, quizzes, assignments, forums) so unpaid /
 * unenrolled students see only locked structure, never the actual material.
 *
 * Access rules:
 *   - Staff (a teacher/TA assigned to the course, or a tenant manager/admin)
 *     always have access — they manage/deliver the course.
 *   - A student needs an ACTIVE enrolment. Because the payment gate in
 *     EnrolmentService blocks activation of a paid course until a succeeded
 *     payment exists, an active enrolment already implies "paid" for paid
 *     courses. We double-check payment defensively for paid courses.
 */
class CourseAccessService
{
    /** Returns ['access' => bool, 'reason' => string, 'is_paid' => bool, 'enrolled' => bool]. */
    public function describe(string $tenantId, string $courseId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId, $userId) {
            $course = DB::selectOne(
                'SELECT id, is_paid FROM courses WHERE id = ? AND deleted_at IS NULL',
                [$courseId]
            );
            if (! $course) {
                return ['access' => false, 'reason' => 'not_found', 'is_paid' => false, 'enrolled' => false];
            }

            // staff bypass: teacher/ta assigned to THIS course
            $isCourseStaff = DB::selectOne(
                "SELECT 1 FROM context_role_assignments cra
                   JOIN roles r ON r.id = cra.role_id AND r.name IN ('teacher','ta')
                   JOIN contexts ctx ON ctx.id = cra.context_id
                        AND ctx.level = 'course' AND ctx.instance_id = ?
                  WHERE cra.user_id = ? LIMIT 1",
                [$courseId, $userId]
            );
            // staff bypass: tenant manager/admin (manage any course in the tenant)
            $isTenantStaff = DB::selectOne(
                "SELECT 1 FROM context_role_assignments cra
                   JOIN roles r ON r.id = cra.role_id
                        AND r.name IN ('manager','tenant_admin','course_manager')
                  WHERE cra.user_id = ? LIMIT 1",
                [$userId]
            );
            if ($isCourseStaff || $isTenantStaff) {
                return ['access' => true, 'reason' => 'staff', 'is_paid' => (bool) $course->is_paid, 'enrolled' => true];
            }

            // student: must have an active enrolment
            $enrolled = DB::selectOne(
                "SELECT 1 FROM user_enrolments
                  WHERE course_id = ? AND user_id = ? AND status = 'active' LIMIT 1",
                [$courseId, $userId]
            );
            if (! $enrolled) {
                return [
                    'access' => false,
                    'reason' => $course->is_paid ? 'payment_required' : 'not_enrolled',
                    'is_paid' => (bool) $course->is_paid,
                    'enrolled' => false,
                ];
            }

            // for a paid course, defensively confirm a succeeded payment exists
            if ($course->is_paid) {
                $paid = DB::selectOne(
                    "SELECT 1 FROM orders o
                       JOIN payments p ON p.order_id = o.id AND p.status = 'succeeded'
                      WHERE o.user_id = ? AND o.item_id = ? AND o.item_type = 'course'
                        AND o.status = 'paid' LIMIT 1",
                    [$userId, $courseId]
                );
                if (! $paid) {
                    return ['access' => false, 'reason' => 'payment_required', 'is_paid' => true, 'enrolled' => true];
                }
            }

            return ['access' => true, 'reason' => 'enrolled', 'is_paid' => (bool) $course->is_paid, 'enrolled' => true];
        });
    }

    public function canAccess(string $tenantId, string $courseId, string $userId): bool
    {
        return $this->describe($tenantId, $courseId, $userId)['access'];
    }

    /** Throw 402/403 if the user may not access the course's content. */
    public function assertAccess(string $tenantId, string $courseId, string $userId): void
    {
        $d = $this->describe($tenantId, $courseId, $userId);
        if ($d['access']) {
            return;
        }
        if ($d['reason'] === 'not_found') {
            throw new HttpException(404, 'Course not found');
        }
        if ($d['reason'] === 'payment_required') {
            throw new HttpException(402, 'This course must be purchased before its content can be accessed.');
        }
        throw new HttpException(403, 'You must be enrolled in this course to access its content.');
    }

    /** Resolve the course id that owns a module, then assert access. */
    public function assertModuleAccess(string $tenantId, string $moduleId, string $userId): void
    {
        $courseId = TenantContext::withTenant($tenantId, function () use ($moduleId) {
            $row = DB::selectOne('SELECT course_id FROM course_modules WHERE id = ?', [$moduleId]);

            return $row->course_id ?? null;
        });
        if (! $courseId) {
            throw new HttpException(404, 'Module not found');
        }
        $this->assertAccess($tenantId, $courseId, $userId);
    }

    /** Resolve the course via a quiz, then assert access. */
    public function assertQuizAccess(string $tenantId, string $quizId, string $userId): void
    {
        $courseId = TenantContext::withTenant($tenantId, function () use ($quizId) {
            $row = DB::selectOne('SELECT course_id FROM quizzes WHERE id = ?', [$quizId]);
            return $row->course_id ?? null;
        });
        if (! $courseId) throw new HttpException(404, 'Quiz not found');
        $this->assertAccess($tenantId, $courseId, $userId);
    }

    /** Resolve the course via a forum, then assert access. */
    public function assertForumAccess(string $tenantId, string $forumId, string $userId): void
    {
        $courseId = TenantContext::withTenant($tenantId, function () use ($forumId) {
            $row = DB::selectOne('SELECT course_id FROM forums WHERE id = ?', [$forumId]);
            return $row->course_id ?? null;
        });
        if (! $courseId) throw new HttpException(404, 'Forum not found');
        $this->assertAccess($tenantId, $courseId, $userId);
    }

    /** Resolve the course via discussion → forum, then assert access. */
    public function assertDiscussionAccess(string $tenantId, string $discussionId, string $userId): void
    {
        $courseId = TenantContext::withTenant($tenantId, function () use ($discussionId) {
            $row = DB::selectOne(
                'SELECT f.course_id FROM discussions d JOIN forums f ON f.id = d.forum_id WHERE d.id = ?',
                [$discussionId]
            );
            return $row->course_id ?? null;
        });
        if (! $courseId) throw new HttpException(404, 'Discussion not found');
        $this->assertAccess($tenantId, $courseId, $userId);
    }

    /** Resolve the course via a file's optional course_id, then assert access.
     *  If the file has no course linkage it is treated as unrestricted. */
    public function assertFileAccess(string $tenantId, string $fileId, string $userId): void
    {
        $courseId = TenantContext::withTenant($tenantId, function () use ($fileId) {
            $row = DB::selectOne('SELECT course_id FROM files WHERE id = ?', [$fileId]);
            return $row->course_id ?? null;
        });
        if (! $courseId) return; // file not linked to a course → no course gate
        $this->assertAccess($tenantId, $courseId, $userId);
    }

    /** Resolve the course via an assignment, then assert access. */
    public function assertAssignmentAccess(string $tenantId, string $assignmentId, string $userId): void
    {
        $courseId = TenantContext::withTenant($tenantId, function () use ($assignmentId) {
            $row = DB::selectOne('SELECT course_id FROM assignments WHERE id = ?', [$assignmentId]);
            return $row->course_id ?? null;
        });
        if (! $courseId) throw new HttpException(404, 'Assignment not found');
        $this->assertAccess($tenantId, $courseId, $userId);
    }
}
