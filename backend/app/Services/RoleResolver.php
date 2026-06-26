<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Centralized role & permission resolver.
 * Single source of truth for authorization checks.
 * 
 * All role-related queries go through here.
 * Cached per (user_id, tenant_id, context_id) for performance.
 */
class RoleResolver
{
    private const CACHE_TTL = 3600; // 1 hour
    private const CACHE_PREFIX = 'rbac:';

    /**
     * Get effective role for a user in a context.
     * 
     * Returns the highest-priority role assigned to the user
     * in the context (or ancestor contexts).
     * 
     * Priority: SYSTEM_ADMIN > TENANT_ADMIN > MANAGER > COURSE_MANAGER > TEACHER > TA > STUDENT > OBSERVER
     */
    public static function getEffectiveRole(User $user, ?string $tenantId = null, ?string $contextId = null): ?string
    {
        // If no tenant specified, use user's current tenant from auth
        $tenantId = $tenantId ?? auth('api')->user()?->current_tenant_id;
        if (!$tenantId) {
            return null;
        }

        $cacheKey = self::CACHE_PREFIX . "role:{$user->id}:{$tenantId}:{$contextId}";
        
        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $tenantId, $contextId) {
            // Query the highest-priority role for this user in this tenant/context
            $role = DB::table('model_has_roles as mhr')
                ->join('roles as r', 'r.id', '=', 'mhr.role_id')
                ->where('mhr.model_id', $user->id)
                ->where('mhr.team_id', $tenantId)
                ->orderByRaw("CASE r.name
                    WHEN 'SYSTEM_ADMIN' THEN 0
                    WHEN 'TENANT_ADMIN' THEN 1
                    WHEN 'MANAGER' THEN 2
                    WHEN 'COURSE_MANAGER' THEN 3
                    WHEN 'TEACHER' THEN 4
                    WHEN 'TA' THEN 5
                    WHEN 'STUDENT' THEN 6
                    WHEN 'OBSERVER' THEN 7
                    ELSE 100
                END")
                ->select('r.name')
                ->first();

            return $role?->name;
        });
    }

    /**
     * Check if user has a specific permission in a context.
     * 
     * Returns true if:
     * 1. User's role (or any parent context role) has the permission
     * 2. Permission is not explicitly denied (PROHIBIT)
     * 3. User's tenant matches the context's tenant
     */
    public static function hasPermission(User $user, string $permission, ?string $tenantId = null, ?string $contextId = null): bool
    {
        $tenantId = $tenantId ?? auth('api')->user()?->current_tenant_id;
        if (!$tenantId) {
            return false;
        }

        $cacheKey = self::CACHE_PREFIX . "perm:{$user->id}:{$tenantId}:{$contextId}:{$permission}";
        
        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $permission, $tenantId, $contextId) {
            // 1. Check if permission is explicitly denied
            $denied = DB::table('permission_overrides')
                ->where('tenant_id', $tenantId)
                ->where('context_id', $contextId)
                ->where('effect', -1000) // PROHIBIT
                ->where('permission', $permission)
                ->whereRaw("(user_id = ? OR role_id IN (SELECT role_id FROM model_has_roles WHERE model_id = ? AND team_id = ?))", 
                    [$user->id, $user->id, $tenantId])
                ->exists();

            if ($denied) {
                return false;
            }

            // 2. Check if permission is granted via role
            $granted = DB::table('model_has_permissions as mhp')
                ->join('permissions as p', 'p.id', '=', 'mhp.permission_id')
                ->where('mhp.model_id', $user->id)
                ->where('mhp.team_id', $tenantId)
                ->where('p.name', $permission)
                ->exists();

            if ($granted) {
                return true;
            }

            // 3. Check via role permissions
            $granted = DB::table('model_has_roles as mhr')
                ->join('roles as r', 'r.id', '=', 'mhr.role_id')
                ->join('role_has_permissions as rhp', 'rhp.role_id', '=', 'r.id')
                ->join('permissions as p', 'p.id', '=', 'rhp.permission_id')
                ->where('mhr.model_id', $user->id)
                ->where('mhr.team_id', $tenantId)
                ->where('p.name', $permission)
                ->exists();

            return (bool) $granted;
        });
    }

    /**
     * Get all permissions for a user in a context.
     */
    public static function getPermissions(User $user, ?string $tenantId = null): array
    {
        $tenantId = $tenantId ?? auth('api')->user()?->current_tenant_id;
        if (!$tenantId) {
            return [];
        }

        $cacheKey = self::CACHE_PREFIX . "perms:{$user->id}:{$tenantId}";
        
        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $tenantId) {
            return DB::table('model_has_permissions as mhp')
                ->join('permissions as p', 'p.id', '=', 'mhp.permission_id')
                ->where('mhp.model_id', $user->id)
                ->where('mhp.team_id', $tenantId)
                ->pluck('p.name')
                ->merge(
                    DB::table('model_has_roles as mhr')
                        ->join('roles as r', 'r.id', '=', 'mhr.role_id')
                        ->join('role_has_permissions as rhp', 'rhp.role_id', '=', 'r.id')
                        ->join('permissions as p', 'p.id', '=', 'rhp.permission_id')
                        ->where('mhr.model_id', $user->id)
                        ->where('mhr.team_id', $tenantId)
                        ->pluck('p.name')
                )
                ->unique()
                ->values()
                ->toArray();
        });
    }

    /**
     * Get dashboard metadata for a user.
     * 
     * Returns which dashboard type to show based on role.
     */
    public static function getDashboardType(User $user, ?string $tenantId = null): string
    {
        $role = self::getEffectiveRole($user, $tenantId);

        return match ($role) {
            'SYSTEM_ADMIN' => 'admin',
            'TENANT_ADMIN' => 'manager',
            'MANAGER' => 'manager',
            'COURSE_MANAGER' => 'manager',
            'TEACHER' => 'teacher',
            'TA' => 'teacher',
            'STUDENT' => 'student',
            'OBSERVER' => 'observer',
            default => 'student',
        };
    }

    /**
     * Invalidate cache for a user.
     * 
     * Call this whenever a user's roles or permissions change.
     */
    public static function invalidateUserCache(string $userId, ?string $tenantId = null): void
    {
        $pattern = self::CACHE_PREFIX . "{$userId}:*";
        
        if ($tenantId) {
            Cache::forget(self::CACHE_PREFIX . "role:{$userId}:{$tenantId}:*");
            Cache::forget(self::CACHE_PREFIX . "perm:{$userId}:{$tenantId}:*");
            Cache::forget(self::CACHE_PREFIX . "perms:{$userId}:{$tenantId}");
        } else {
            // Clear all cache for this user
            $keys = Cache::tags(['rbac'])->flush();
        }
    }

    /**
     * Get navigation menu structure based on role.
     */
    public static function getNavigationStructure(string $role): array
    {
        return match ($role) {
            'SYSTEM_ADMIN' => [
                ['id' => 'dashboard', 'label' => 'Dashboard', 'href' => '/dashboard', 'icon' => 'grid'],
                ['id' => 'users', 'label' => 'Users', 'href' => '/admin/users', 'icon' => 'users'],
                ['id' => 'tenants', 'label' => 'Organizations', 'href' => '/admin/tenants', 'icon' => 'building'],
                ['id' => 'roles', 'label' => 'Roles & Permissions', 'href' => '/admin/roles', 'icon' => 'shield'],
                ['id' => 'payments', 'label' => 'Payments', 'href' => '/admin/payments', 'icon' => 'credit-card'],
                ['id' => 'reports', 'label' => 'Reports', 'href' => '/admin/reports', 'icon' => 'bar-chart'],
                ['id' => 'audit', 'label' => 'Audit Logs', 'href' => '/admin/audit', 'icon' => 'log'],
                ['id' => 'settings', 'label' => 'System Settings', 'href' => '/admin/settings', 'icon' => 'cog'],
                ['id' => 'integrations', 'label' => 'Integrations', 'href' => '/admin/integrations', 'icon' => 'plug'],
            ],
            'MANAGER', 'TENANT_ADMIN' => [
                ['id' => 'dashboard', 'label' => 'Dashboard', 'href' => '/dashboard', 'icon' => 'grid'],
                ['id' => 'students', 'label' => 'Students', 'href' => '/manager/students', 'icon' => 'users'],
                ['id' => 'teachers', 'label' => 'Teachers', 'href' => '/manager/teachers', 'icon' => 'user-tie'],
                ['id' => 'programs', 'label' => 'Programs', 'href' => '/manager/programs', 'icon' => 'layers'],
                ['id' => 'courses', 'label' => 'Courses', 'href' => '/manager/courses', 'icon' => 'book'],
                ['id' => 'enrollments', 'label' => 'Enrollments', 'href' => '/manager/enrollments', 'icon' => 'check-circle'],
                ['id' => 'payments', 'label' => 'Payments', 'href' => '/manager/payments', 'icon' => 'credit-card'],
                ['id' => 'reports', 'label' => 'Reports', 'href' => '/manager/reports', 'icon' => 'bar-chart'],
            ],
            'TEACHER', 'TA' => [
                ['id' => 'dashboard', 'label' => 'Dashboard', 'href' => '/dashboard', 'icon' => 'grid'],
                ['id' => 'courses', 'label' => 'My Courses', 'href' => '/teacher/courses', 'icon' => 'book'],
                ['id' => 'students', 'label' => 'Students', 'href' => '/teacher/students', 'icon' => 'users'],
                ['id' => 'grading', 'label' => 'Grading', 'href' => '/teacher/grading', 'icon' => 'clipboard-check'],
                ['id' => 'forums', 'label' => 'Forums', 'href' => '/teacher/forums', 'icon' => 'message-square'],
                ['id' => 'messages', 'label' => 'Messages', 'href' => '/teacher/messages', 'icon' => 'mail'],
                ['id' => 'reports', 'label' => 'Reports', 'href' => '/teacher/reports', 'icon' => 'bar-chart'],
            ],
            'STUDENT' => [
                ['id' => 'dashboard', 'label' => 'Dashboard', 'href' => '/dashboard', 'icon' => 'grid'],
                ['id' => 'courses', 'label' => 'My Courses', 'href' => '/student/courses', 'icon' => 'book'],
                ['id' => 'assignments', 'label' => 'Assignments', 'href' => '/student/assignments', 'icon' => 'tasks'],
                ['id' => 'quizzes', 'label' => 'Quizzes', 'href' => '/student/quizzes', 'icon' => 'help-circle'],
                ['id' => 'grades', 'label' => 'Grades', 'href' => '/grades', 'icon' => 'award'],
                ['id' => 'certificates', 'label' => 'Certificates', 'href' => '/certificates', 'icon' => 'ribbon'],
                ['id' => 'forums', 'label' => 'Forums', 'href' => '/forums', 'icon' => 'message-square'],
                ['id' => 'messages', 'label' => 'Messages', 'href' => '/messages', 'icon' => 'mail'],
            ],
            'OBSERVER' => [
                ['id' => 'dashboard', 'label' => 'Dashboard', 'href' => '/dashboard', 'icon' => 'grid'],
                ['id' => 'courses', 'label' => 'Observed Courses', 'href' => '/observer/courses', 'icon' => 'book'],
                ['id' => 'students', 'label' => 'Students', 'href' => '/observer/students', 'icon' => 'users'],
                ['id' => 'activity', 'label' => 'Activity', 'href' => '/observer/activity', 'icon' => 'activity'],
            ],
            default => [
                ['id' => 'dashboard', 'label' => 'Dashboard', 'href' => '/dashboard', 'icon' => 'grid'],
            ],
        };
    }
}
