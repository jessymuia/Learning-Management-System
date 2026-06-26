<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * ReportingService — pre-aggregated read models for dashboards (spec §5.4, §9).
 *
 * Reads denormalized summary tables (gradebook_summary, program_progress,
 * course_completion) rather than computing live — the spec's read/write
 * asymmetry. In production these feed from ClickHouse marts; here we aggregate
 * the OLTP summary tables, which is correct for moderate scale.
 */
class ReportingService
{
    /** Course-level overview: enrolment, completion, average grade. */
    public function courseOverview(string $tenantId, string $courseId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            $enrol = DB::selectOne(
                "SELECT
                   COUNT(*) FILTER (WHERE status='active') AS active_enrolments,
                   COUNT(*) FILTER (WHERE status='suspended') AS suspended_enrolments
                 FROM user_enrolments WHERE course_id = ?",
                [$courseId]
            );
            $completion = DB::selectOne(
                "SELECT
                   COUNT(*) FILTER (WHERE state='complete') AS completed,
                   COUNT(*) AS tracked
                 FROM course_completion WHERE course_id = ?",
                [$courseId]
            );
            $grades = DB::selectOne(
                'SELECT ROUND(AVG(course_total_pct), 2) AS avg_pct, COUNT(*) AS graded_learners
                   FROM gradebook_summary WHERE course_id = ?',
                [$courseId]
            );

            return (object) [
                'course_id' => $courseId,
                'active_enrolments' => (int) ($enrol->active_enrolments ?? 0),
                'suspended_enrolments' => (int) ($enrol->suspended_enrolments ?? 0),
                'completed' => (int) ($completion->completed ?? 0),
                'tracked' => (int) ($completion->tracked ?? 0),
                'avg_grade_pct' => $grades->avg_pct,
                'graded_learners' => (int) ($grades->graded_learners ?? 0),
            ];
        });
    }

    /** At-risk learners: enrolled, low grade or not progressing. */
    public function atRiskLearners(string $tenantId, string $courseId, float $threshold = 50.0): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId, $threshold) {
            return DB::select(
                "SELECT ue.user_id, u.email, gs.course_total_pct
                   FROM user_enrolments ue
                   JOIN users u ON u.id = ue.user_id
                   LEFT JOIN gradebook_summary gs ON gs.course_id = ue.course_id AND gs.user_id = ue.user_id
                  WHERE ue.course_id = ? AND ue.status = 'active'
                    AND (gs.course_total_pct IS NULL OR gs.course_total_pct < ?)
                  ORDER BY gs.course_total_pct NULLS FIRST
                  LIMIT 200",
                [$courseId, $threshold]
            );
        });
    }

    /** Tenant-wide rollup for the admin dashboard. */
    /** Time-series + breakdown analytics for charts (last 6 months). */
    public function trends(string $tenantId): object
    {
        return TenantContext::withTenant($tenantId, function () {
            // monthly enrolments (last 6 months)
            $enrolments = DB::select(
                "SELECT to_char(date_trunc('month', created_at), 'Mon') AS label,
                        date_trunc('month', created_at) AS month,
                        COUNT(*) AS value
                   FROM user_enrolments
                  WHERE created_at > now() - interval '6 months'
                  GROUP BY 1, 2 ORDER BY 2"
            );

            // monthly revenue (last 6 months, paid orders)
            $revenue = DB::select(
                "SELECT to_char(date_trunc('month', created_at), 'Mon') AS label,
                        date_trunc('month', created_at) AS month,
                        COALESCE(SUM(amount_minor), 0) AS value
                   FROM orders
                  WHERE status = 'paid' AND created_at > now() - interval '6 months'
                  GROUP BY 1, 2 ORDER BY 2"
            );

            // completion breakdown
            $breakdown = DB::selectOne(
                "SELECT
                    COUNT(*) FILTER (WHERE state = 'complete') AS completed,
                    COUNT(*) FILTER (WHERE state = 'inprogress') AS in_progress
                   FROM course_completion"
            );

            // top courses by enrolment
            $topCourses = DB::select(
                "SELECT c.fullname AS label, COUNT(ue.id) AS value
                   FROM courses c
                   LEFT JOIN user_enrolments ue ON ue.course_id = c.id AND ue.status = 'active'
                  WHERE c.deleted_at IS NULL
                  GROUP BY c.id, c.fullname
                  ORDER BY value DESC LIMIT 5"
            );

            return (object) [
                'enrolments' => $enrolments,
                'revenue' => $revenue,
                'completion_breakdown' => $breakdown,
                'top_courses' => $topCourses,
            ];
        });
    }

    /** Rich org-management overview for the Tenant Manager dashboard.
     *  Everything runs inside withTenant → RLS-isolated to this org. */
    public function orgOverview(string $tenantId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId) {
            $base = DB::selectOne(
                "SELECT
                   (SELECT COUNT(*) FROM courses WHERE deleted_at IS NULL) AS total_courses,
                   (SELECT COUNT(*) FROM courses WHERE deleted_at IS NULL AND status='active') AS published_courses,
                   (SELECT COUNT(*) FROM courses WHERE deleted_at IS NULL AND status<>'active') AS draft_courses,
                   (SELECT COUNT(*) FROM programs WHERE status='active') AS total_programs,
                   (SELECT COUNT(*) FROM user_enrolments WHERE status='active') AS active_enrolments,
                   (SELECT COUNT(*) FROM user_enrolments WHERE status='suspended' OR status='completed') AS inactive_enrolments,
                   (SELECT COUNT(*) FROM course_completion WHERE state='complete') AS completed_courses,
                   (SELECT COUNT(*) FROM user_enrolments WHERE created_at > now() - interval '7 days') AS new_enrolments_7d,
                   (SELECT COALESCE(SUM(amount_minor),0) FROM orders WHERE status='paid') AS revenue_minor,
                   (SELECT COUNT(*) FROM orders WHERE status='paid') AS paid_payments,
                   (SELECT COUNT(*) FROM orders WHERE status='pending') AS pending_payments,
                   (SELECT COUNT(*) FROM orders WHERE status='failed') AS failed_payments"
            );

            $roleRows = DB::select(
                "SELECT r.name, COUNT(DISTINCT cra.user_id) AS c
                   FROM context_role_assignments cra
                   JOIN roles r ON r.id = cra.role_id
                   JOIN users u ON u.id = cra.user_id AND u.deleted_at IS NULL
                  GROUP BY r.name"
            );
            $byRole = [];
            foreach ($roleRows as $r) {
                $byRole[$r->name] = (int) $r->c;
            }

            $newStudents = DB::selectOne(
                "SELECT COUNT(DISTINCT tm.user_id) AS c FROM tenant_memberships tm
                  WHERE tm.joined_at > now() - interval '30 days'"
            );

            // top courses by active enrolment (for course analytics)
            $topCourses = DB::select(
                "SELECT c.id, c.fullname AS label, c.shortname,
                        COUNT(ue.id) AS enrolments,
                        COUNT(cc.id) FILTER (WHERE cc.state='complete') AS completions
                   FROM courses c
                   LEFT JOIN user_enrolments ue ON ue.course_id = c.id AND ue.status = 'active'
                   LEFT JOIN course_completion cc ON cc.course_id = c.id
                  WHERE c.deleted_at IS NULL
                  GROUP BY c.id, c.fullname, c.shortname
                  ORDER BY enrolments DESC LIMIT 6"
            );

            // student activity: active learners = enrolled students with completion in last 30 days
            $activeStudents = DB::selectOne(
                "SELECT COUNT(DISTINCT ac.user_id) AS c
                   FROM activity_completion ac
                  WHERE ac.completed_at > now() - interval '30 days'"
            );

            // performance overview: average course grade and pass rate across the
            // tenant's gradebook (only learners who have a computed total)
            $perf = DB::selectOne(
                "SELECT ROUND(AVG(course_total_pct)::numeric, 1) AS avg_pct,
                        COUNT(*) AS graded,
                        COUNT(*) FILTER (WHERE course_total_pct >= 50) AS passing
                   FROM gradebook_summary
                  WHERE course_total_pct IS NOT NULL"
            );
            $graded = (int) ($perf->graded ?? 0);

            return (object) [
                'total_courses' => (int) $base->total_courses,
                'published_courses' => (int) $base->published_courses,
                'draft_courses' => (int) $base->draft_courses,
                'total_programs' => (int) $base->total_programs,
                'active_enrolments' => (int) $base->active_enrolments,
                'inactive_enrolments' => (int) $base->inactive_enrolments,
                'new_enrolments_7d' => (int) $base->new_enrolments_7d,
                'completed_courses' => (int) $base->completed_courses,
                'revenue_minor' => (int) $base->revenue_minor,
                'paid_payments' => (int) $base->paid_payments,
                'pending_payments' => (int) $base->pending_payments,
                'failed_payments' => (int) $base->failed_payments,
                'students' => $byRole['student'] ?? 0,
                'teachers' => ($byRole['teacher'] ?? 0) + ($byRole['ta'] ?? 0),
                'new_students_30d' => (int) $newStudents->c,
                'active_learners' => (int) $activeStudents->c,
                'avg_performance_pct' => $perf->avg_pct !== null ? (float) $perf->avg_pct : null,
                'graded_learners' => $graded,
                'pass_rate_pct' => $graded > 0 ? (int) round(((int) $perf->passing / $graded) * 100) : null,
                'top_courses' => $topCourses,
            ];
        });
    }

    /** Teachers with their assigned-course and student counts (tenant-scoped). */
    public function teacherActivity(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () {
            return DB::select(
                "SELECT u.id, u.email,
                        COUNT(DISTINCT ctx.instance_id) AS courses,
                        COALESCE(SUM(ec.enrolled), 0) AS students
                   FROM context_role_assignments cra
                   JOIN roles r ON r.id = cra.role_id AND r.name IN ('teacher','ta')
                   JOIN users u ON u.id = cra.user_id AND u.deleted_at IS NULL
                   JOIN contexts ctx ON ctx.id = cra.context_id AND ctx.level = 'course'
                   LEFT JOIN LATERAL (
                       SELECT COUNT(*) AS enrolled FROM user_enrolments ue
                        WHERE ue.course_id = ctx.instance_id AND ue.status = 'active'
                   ) ec ON true
                  GROUP BY u.id, u.email
                  ORDER BY courses DESC, u.email
                  LIMIT 10"
            );
        });
    }

    /** Recent org activity feed from the tenant's audit log. */
    public function orgActivity(string $tenantId, int $limit = 10): array
    {
        return TenantContext::withTenant($tenantId, function () use ($limit) {
            return DB::select(
                "SELECT a.action, a.target_type, a.created_at, u.email AS actor_email
                   FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
                  ORDER BY a.created_at DESC LIMIT ?",
                [$limit]
            );
        });
    }

    public function tenantOverview(string $tenantId): object
    {
        return TenantContext::withTenant($tenantId, function () {
            $courses = DB::selectOne("SELECT COUNT(*) AS c FROM courses WHERE deleted_at IS NULL");
            $members = DB::selectOne("SELECT COUNT(*) AS c FROM tenant_memberships WHERE status='active'");
            $programs = DB::selectOne("SELECT COUNT(*) AS c FROM programs WHERE status='active'");
            $completions = DB::selectOne("SELECT COUNT(*) AS c FROM course_completion WHERE state='complete'");

            // revenue + payment analytics
            $revenue = DB::selectOne("SELECT COALESCE(SUM(amount_minor),0) AS total, COUNT(*) AS paid_orders
                                        FROM orders WHERE status='paid'");
            $pending = DB::selectOne("SELECT COUNT(*) AS c FROM orders WHERE status='pending'");
            $enrolments = DB::selectOne("SELECT COUNT(*) AS c FROM user_enrolments WHERE status='active'");

            // simple completion rate
            $totalEnrol = (int) $enrolments->c;
            $completionRate = $totalEnrol > 0 ? round(((int) $completions->c / $totalEnrol) * 100) : 0;

            return (object) [
                'active_courses' => (int) $courses->c,
                'active_members' => (int) $members->c,
                'active_programs' => (int) $programs->c,
                'course_completions' => (int) $completions->c,
                'active_enrolments' => $totalEnrol,
                'completion_rate' => $completionRate,
                'revenue_minor' => (int) $revenue->total,
                'paid_orders' => (int) $revenue->paid_orders,
                'pending_orders' => (int) $pending->c,
            ];
        });
    }
}
