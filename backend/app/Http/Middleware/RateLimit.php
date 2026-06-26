<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * RateLimit — per-identity request throttling (spec §1.2, §10 security).
 * Uses the cache store as a fixed-window counter. Configurable via args:
 *   ->middleware('ratelimit:120,60')  // 120 requests / 60s
 * Identity = authenticated user id when present, else client IP.
 */
class RateLimit
{
    public function handle(Request $request, Closure $next, int $max = 120, int $windowSeconds = 60)
    {
        $id = $request->attributes->get('userId') ?: $request->ip();
        $key = 'rl:'.sha1($id.'|'.$request->path());
        $window = (int) floor(time() / $windowSeconds);
        $bucket = $key.':'.$window;

        $hits = (int) Cache::get($bucket, 0) + 1;
        Cache::put($bucket, $hits, $windowSeconds);

        if ($hits > $max) {
            throw new HttpException(429, 'Too many requests — slow down.');
        }

        $response = $next($request);
        if (method_exists($response, 'header')) {
            $response->header('X-RateLimit-Limit', (string) $max);
            $response->header('X-RateLimit-Remaining', (string) max(0, $max - $hits));
        }

        return $response;
    }
}
