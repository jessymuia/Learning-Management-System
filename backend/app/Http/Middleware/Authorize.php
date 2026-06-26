<?php

namespace App\Http\Middleware;

use App\Services\RbacService;
use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Authorize — permission guard built on the RBAC resolver.
 *
 * Because permission checks read tenant-scoped tables, the check runs inside
 * withTenant(). Declared on routes as:
 *
 *   ->middleware('authorize:course.manage,tenant')          // tenant-root context
 *   ->middleware('authorize:course.manage,course:id')       // context of route param {id}
 *
 * The second argument selects the context:
 *   tenant         -> the tenant root context
 *   {level}:{param}-> resolve the context wrapping the instance from route {param}
 */
class Authorize
{
    public function __construct(private RbacService $rbac) {}

    public function handle(Request $request, Closure $next, string $permission, string $scope = 'tenant')
    {
        $userId = $request->attributes->get('userId');
        $tenantId = $request->attributes->get('tenantId');
        if (! $userId || ! $tenantId) {
            throw new HttpException(401, 'Authentication required');
        }

        $allowed = TenantContext::withTenant($tenantId, function () use ($request, $userId, $tenantId, $permission, $scope) {
            $contextId = null;

            if ($scope === 'tenant') {
                $contextId = $this->rbac->tenantContext($tenantId);
            } elseif (str_contains($scope, ':')) {
                [$level, $param] = explode(':', $scope, 2);
                $instanceId = $request->route($param);
                if ($instanceId) {
                    $contextId = $this->rbac->contextForInstance($level, $instanceId);
                }
            }

            if (! $contextId) {
                return false;
            }
            $request->attributes->set('authzContextId', $contextId);

            return $this->rbac->can($userId, $contextId, $permission);
        });

        if (! $allowed) {
            throw new HttpException(403, "Missing permission: {$permission}");
        }

        return $next($request);
    }
}
