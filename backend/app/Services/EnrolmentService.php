<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class EnrolmentService
{
    private function ensureMethod(string $tenantId, string $courseId, string $type): string
    {
        $found = DB::selectOne(
            'SELECT id FROM enrolment_methods WHERE course_id = ? AND type = ? LIMIT 1',
            [$courseId, $type]
        );
        if ($found) {
            return $found->id;
        }
        $ins = DB::selectOne(
            'INSERT INTO enrolment_methods (tenant_id, course_id, type, enabled)
             VALUES (?, ?, ?, true) RETURNING id',
            [$tenantId, $courseId, $type]
        );

        return $ins->id;
    }

    public function enrol(string $tenantId, array $data): object
    {
        if (empty($data['courseId']) || empty($data['userId'])) {
            throw new HttpException(400, 'courseId and userId are required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            $course = DB::selectOne('SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL', [$data['courseId']]);
            if (! $course) {
                throw new HttpException(404, 'Course not found');
            }
            $methodId = $this->ensureMethod($tenantId, $data['courseId'], $data['type'] ?? 'manual');

            return DB::selectOne(
                "INSERT INTO user_enrolments (tenant_id, method_id, user_id, course_id, status)
                 VALUES (?, ?, ?, ?, 'active')
                 ON CONFLICT (tenant_id, method_id, user_id)
                 DO UPDATE SET status='active'
                 RETURNING id, user_id, course_id, status, start_at, end_at",
                [$tenantId, $methodId, $data['userId'], $data['courseId']]
            );
        });
    }

    public function listForCourse(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT ue.id, ue.user_id, u.email, ue.status, ue.start_at, ue.end_at
                   FROM user_enrolments ue JOIN users u ON u.id = ue.user_id
                  WHERE ue.course_id = ? ORDER BY u.email',
                [$courseId]
            );
        });
    }


    /** Set an enrolment's status (active|suspended) — used by manage UI. */
    public function setStatus(string $tenantId, string $enrolmentId, string $status): object
    {
        return TenantContext::withTenant($tenantId, function () use ($enrolmentId, $status) {
            $row = DB::selectOne(
                "UPDATE user_enrolments SET status = ? WHERE id = ? RETURNING id, status",
                [$status, $enrolmentId]
            );
            if (! $row) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(404, 'Enrolment not found');
            }
            return $row;
        });
    }

    public function suspend(string $tenantId, string $enrolmentId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($enrolmentId) {
            $row = DB::selectOne(
                "UPDATE user_enrolments SET status='suspended' WHERE id = ? RETURNING id, status",
                [$enrolmentId]
            );
            if (! $row) {
                throw new HttpException(404, 'Enrolment not found');
            }

            return $row;
        });
    }

    public function listForUser(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            return DB::select(
                'SELECT ue.id, ue.course_id, c.shortname, c.fullname, ue.status
                   FROM user_enrolments ue JOIN courses c ON c.id = ue.course_id
                  WHERE ue.user_id = ? AND c.deleted_at IS NULL ORDER BY c.fullname',
                [$userId]
            );
        });
    }

    /** Self-enrolment: a learner enrols themselves into a course that has a
     *  self enrolment method enabled (spec §2.5, Phase 1). */
    public function selfEnrol(string $tenantId, string $courseId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId, $userId) {
            $course = DB::selectOne('SELECT id, is_paid, price_minor, currency FROM courses WHERE id = ? AND deleted_at IS NULL', [$courseId]);
            if (! $course) {
                throw new HttpException(404, 'Course not found');
            }

            // Payment gate (Doc 2): a paid course requires a succeeded payment on a
            // paid order for this course+user before enrolment is activated.
            if ($course->is_paid) {
                $paid = DB::selectOne(
                    "SELECT o.id
                       FROM orders o
                       JOIN payments p ON p.order_id = o.id AND p.status = 'succeeded'
                      WHERE o.user_id = ? AND o.item_type = 'course'
                        AND o.item_id = ? AND o.status = 'paid'
                      LIMIT 1",
                    [$userId, $courseId]
                );
                if (! $paid) {
                    throw new HttpException(402, 'Payment required: this course must be purchased before enrolment.');
                }
            }

            $method = DB::selectOne(
                "SELECT id FROM enrolment_methods WHERE course_id = ? AND type = 'self' AND enabled = true LIMIT 1",
                [$courseId]
            );
            if (! $method) {
                throw new HttpException(403, 'Self-enrolment is not enabled for this course');
            }

            return DB::selectOne(
                "INSERT INTO user_enrolments (tenant_id, method_id, user_id, course_id, status)
                 VALUES (?, ?, ?, ?, 'active')
                 ON CONFLICT (tenant_id, method_id, user_id) DO UPDATE SET status='active'
                 RETURNING id, user_id, course_id, status",
                [$tenantId, $method->id, $userId, $courseId]
            );
        });
    }
}
