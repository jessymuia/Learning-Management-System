<?php

namespace App\Http\Middleware;

use App\Services\RoleResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cache RBAC resolution for the request.
 * 
 * Avoids repeated permission lookups within a single request.
 * Particularly useful for requests that check multiple permissions.
 */
class CacheRbac
{
    public function handle(Request $request, Closure $next): Response
    {
        // Pre-cache user's permissions at the start of the request
        if ($user = auth('api')->user()) {
            $tenantId = $user->current_tenant_id;
            RoleResolver::getPermissions($user, $tenantId);
        }

        return $next($request);
    }
}
