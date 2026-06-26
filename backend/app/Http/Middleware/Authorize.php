<?php

namespace App\Http\Middleware;

use App\Services\RoleResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authorization middleware.
 * 
 * Enforces permission checks on routes.
 * 
 * Usage in routes:
 *   ->middleware('authorize:permission,scope')
 * 
 * Examples:
 *   ->middleware('authorize:course.manage,tenant')
 *   ->middleware('authorize:course.manage,course:id')
 *   ->middleware('authorize:grade.edit,tenant')
 */
class Authorize
{
    public function handle(Request $request, Closure $next, string $permission, string $scope = 'tenant'): Response
    {
        $user = auth('api')->user();
        $tenantId = $user->current_tenant_id;

        // Parse scope: either "tenant" or "course:courseId" or "resource:id"
        $contextId = null;
        if (strpos($scope, ':') !== false) {
            [$type, $paramName] = explode(':', $scope);
            // Get the resource ID from route parameters
            $resourceId = $request->route($paramName);
            if ($resourceId) {
                // Look up the context for this resource
                $contextId = $this->getContextId($type, $resourceId, $tenantId);
            }
        }

        // Check permission
        if (!RoleResolver::hasPermission($user, $permission, $tenantId, $contextId)) {
            return response()->json([
                'error' => 'Unauthorized',
                'message' => "You do not have permission to: {$permission}",
            ], 403);
        }

        return $next($request);
    }

    /**
     * Look up context ID for a resource.
     */
    private function getContextId(string $type, string $resourceId, string $tenantId): ?string
    {
        // For now, resolve common resource types
        // In production, this would be more sophisticated
        
        return match ($type) {
            'course' => $this->getCourseContextId($resourceId, $tenantId),
            'section' => $this->getSectionContextId($resourceId, $tenantId),
            'module' => $this->getModuleContextId($resourceId, $tenantId),
            default => null,
        };
    }

    private function getCourseContextId(string $courseId, string $tenantId): ?string
    {
        return \DB::table('contexts')
            ->where('tenant_id', $tenantId)
            ->where('level', 'course')
            ->where('instance_id', $courseId)
            ->value('id');
    }

    private function getSectionContextId(string $sectionId, string $tenantId): ?string
    {
        return \DB::table('contexts')
            ->where('tenant_id', $tenantId)
            ->where('level', 'section')
            ->where('instance_id', $sectionId)
            ->value('id');
    }

    private function getModuleContextId(string $moduleId, string $tenantId): ?string
    {
        return \DB::table('contexts')
            ->where('tenant_id', $tenantId)
            ->where('level', 'module')
            ->where('instance_id', $moduleId)
            ->value('id');
    }
}
