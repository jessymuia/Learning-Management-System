<?php

namespace App\Http\Middleware;

use App\Services\TokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Authenticate — verifies the bearer access token and attaches identity to the
 * request. The tenant id from the token is the tenant-scoping authority for the
 * whole request; downstream withTenant() calls use $request->attributes 'tenantId'.
 */
class Authenticate
{
    public function __construct(private TokenService $tokens) {}

    public function handle(Request $request, Closure $next)
    {
        $header = $request->header('Authorization', '');
        if (! str_starts_with($header, 'Bearer ')) {
            throw new HttpException(401, 'Missing bearer token');
        }
        $token = substr($header, 7);

        try {
            $payload = $this->tokens->verify($token);
        } catch (\Throwable $e) {
            throw new HttpException(401, 'Invalid or expired token');
        }
        if (($payload->typ ?? null) !== 'access') {
            throw new HttpException(401, 'Wrong token type');
        }

        $request->attributes->set('userId', $payload->sub);
        $request->attributes->set('tenantId', $payload->tid);
        $request->attributes->set('email', $payload->email ?? null);

        return $next($request);
    }
}
