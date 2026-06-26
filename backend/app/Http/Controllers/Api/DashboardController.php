<?php

namespace App\Http\Controllers\Api;

use App\Services\RoleResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Dashboard metadata and data endpoint.
 * 
 * Returns role-aware dashboard configuration and initial data.
 * Single source of truth for what each role sees.
 */
class DashboardController extends Controller
{
    /**
     * GET /api/dashboard
     * 
     * Returns:
     * - dashboardType: admin|manager|teacher|student|observer
     * - role: effective role name
     * - permissions: array of user's permissions
     * - navigation: role-specific menu structure
     * - data: initial dashboard statistics (role-appropriate)
     */
    public function index(): JsonResponse
    {
        $user = auth('api')->user();
        $tenantId = $user->current_tenant_id;

        // Determine dashboard type from role
        $dashboardType = RoleResolver::getDashboardType($user, $tenantId);
        $role = RoleResolver::getEffectiveRole($user, $tenantId);
        $permissions = RoleResolver::getPermissions($user, $tenantId);
        $navigation = RoleResolver::getNavigationStructure($role);

        // Get role-appropriate dashboard data
        $data = match ($dashboardType) {
            'admin' => $this->getAdminData(),
            'manager' => $this->getManagerData($tenantId),
            'teacher' => $this->getTeacherData($user->id, $tenantId),
            'student' => $this->getStudentData($user->id, $tenantId),
            'observer' => $this->getObserverData($user->id, $tenantId),
            default => [],
        };

        return response()->json([
            'data' => [
                'dashboardType' => $dashboardType,
                'role' => $role,
                'userId' => $user->id,
                'tenantId' => $tenantId,
                'permissions' => $permissions,
                'navigation' => $navigation,
                'dashboard' => $data,
            ],
        ]);
    }

    /**
     * System admin: platform-wide stats
     */
    private function getAdminData(): array
    {
        return [
            'title' => 'Platform Overview',
            'stats' => [
                [
                    'label' => 'Total Users',
                    'value' => DB::table('users')->count(),
                    'trend' => '+5%',
                ],
                [
                    'label' => 'Active Tenants',
                    'value' => DB::table('tenants')->where('status', 'active')->count(),
                    'trend' => '+2%',
                ],
                [
                    'label' => 'Total Courses',
                    'value' => DB::table('courses')->count(),
                    'trend' => '+12%',
                ],
                [
                    'label' => 'Platform Revenue',
                    'value' => '$' . number_format(DB::table('invoices')->sum('amount') / 100, 2),
                    'trend' => '+18%',
                ],
            ],
            'recentActivity' => DB::table('event_log')
                ->orderBy('created_at', 'desc')
                ->limit(10)
                ->select('id', 'event_name', 'user_id', 'tenant_id', 'created_at')
                ->get(),
        ];
    }

    /**
     * Manager/Tenant Admin: organization stats
     */
    private function getManagerData(string $tenantId): array
    {
        return [
            'title' => 'Organization Dashboard',
            'stats' => [
                [
                    'label' => 'Students',
                    'value' => DB::table('user_enrolments')
                        ->where('tenant_id', $tenantId)
                        ->distinct('user_id')
                        ->count(),
                    'trend' => '+3%',
                ],
                [
                    'label' => 'Teachers',
                    'value' => DB::table('model_has_roles')
                        ->where('team_id', $tenantId)
                        ->whereIn('role_id', [4, 5]) // TEACHER, TA
                        ->distinct('model_id')
                        ->count(),
                    'trend' => '+1%',
                ],
                [
                    'label' => 'Active Courses',
                    'value' => DB::table('courses')
                        ->where('tenant_id', $tenantId)
                        ->where('status', 'active')
                        ->count(),
                    'trend' => '+4%',
                ],
                [
                    'label' => 'Enrollment Rate',
                    'value' => '78%',
                    'trend' => '+5%',
                ],
            ],
            'topCourses' => DB::table('courses')
                ->where('tenant_id', $tenantId)
                ->select('id', 'fullname')
                ->limit(5)
                ->get(),
        ];
    }

    /**
     * Teacher/TA: course management view
     */
    private function getTeacherData(string $userId, string $tenantId): array
    {
        return [
            'title' => 'Teaching Dashboard',
            'stats' => [
                [
                    'label' => 'My Courses',
                    'value' => DB::table('context_role_assignments')
                        ->where('user_id', $userId)
                        ->where('tenant_id', $tenantId)
                        ->distinct('context_id')
                        ->count(),
                    'trend' => '0%',
                ],
                [
                    'label' => 'Students',
                    'value' => DB::table('user_enrolments')
                        ->where('tenant_id', $tenantId)
                        ->count(),
                    'trend' => '+2%',
                ],
                [
                    'label' => 'Ungraded',
                    'value' => DB::table('submissions')
                        ->where('tenant_id', $tenantId)
                        ->where('workflow_state', 'complete')
                        ->count(),
                    'trend' => '5 pending',
                ],
                [
                    'label' => 'Avg Grade',
                    'value' => '72%',
                    'trend' => '+1%',
                ],
            ],
            'nextDue' => DB::table('assignments')
                ->where('tenant_id', $tenantId)
                ->where('due_at', '>', now())
                ->orderBy('due_at')
                ->limit(5)
                ->select('id', 'title', 'due_at')
                ->get(),
        ];
    }

    /**
     * Student: learning dashboard
     */
    private function getStudentData(string $userId, string $tenantId): array
    {
        return [
            'title' => 'Learning Dashboard',
            'stats' => [
                [
                    'label' => 'Enrolled Courses',
                    'value' => DB::table('user_enrolments')
                        ->where('user_id', $userId)
                        ->where('tenant_id', $tenantId)
                        ->count(),
                    'trend' => '+1',
                ],
                [
                    'label' => 'In Progress',
                    'value' => DB::table('activity_completion')
                        ->where('user_id', $userId)
                        ->where('state', 0)
                        ->count(),
                    'trend' => '—',
                ],
                [
                    'label' => 'Completed',
                    'value' => DB::table('activity_completion')
                        ->where('user_id', $userId)
                        ->where('state', 1)
                        ->count(),
                    'trend' => '+2',
                ],
                [
                    'label' => 'Average Grade',
                    'value' => '85%',
                    'trend' => '+3%',
                ],
            ],
            'whatNext' => DB::table('assignments')
                ->where('tenant_id', $tenantId)
                ->where('due_at', '>', now())
                ->orderBy('due_at')
                ->limit(1)
                ->select('id', 'title', 'due_at', 'course_id')
                ->first(),
        ];
    }

    /**
     * Observer: monitoring view (read-only)
     */
    private function getObserverData(string $userId, string $tenantId): array
    {
        return [
            'title' => 'Observation Dashboard',
            'stats' => [
                [
                    'label' => 'Observed Courses',
                    'value' => DB::table('context_role_assignments')
                        ->where('user_id', $userId)
                        ->where('tenant_id', $tenantId)
                        ->count(),
                    'trend' => '—',
                ],
                [
                    'label' => 'Students Monitored',
                    'value' => 0,
                    'trend' => '—',
                ],
                [
                    'label' => 'Recent Activity',
                    'value' => DB::table('event_log')
                        ->where('tenant_id', $tenantId)
                        ->where('created_at', '>', now()->subHours(24))
                        ->count(),
                    'trend' => '—',
                ],
            ],
        ];
    }
}
