<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * RequireOperator — gates control-plane endpoints (tenant provisioning,
 * cross-tenant metering, billing) to platform operators / super-admins only.
 * This is OUTSIDE per-tenant RBAC: it checks the global platform_operators table.
 */
class RequireOperator
{
    public function handle(Request $request, Closure $next, string $minLevel = 'operator')
    {
        $userId = $request->attributes->get('userId');
        if (! $userId) {
            throw new HttpException(401, 'Authentication required');
        }

        $op = TenantContext::withSystem(function () use ($userId) {
            return DB::selectOne('SELECT level FROM platform_operators WHERE user_id = ?', [$userId]);
        });

        if (! $op) {
            throw new HttpException(403, 'Platform operator access required');
        }
        if ($minLevel === 'superadmin' && $op->level !== 'superadmin') {
            throw new HttpException(403, 'Super-admin access required');
        }

        $request->attributes->set('operatorLevel', $op->level);

        return $next($request);
    }
}
