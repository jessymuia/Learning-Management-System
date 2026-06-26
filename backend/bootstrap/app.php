<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Stateless JWT API: do NOT enable statefulApi() — it turns on Sanctum's
        // cookie/CSRF handling, which causes "CSRF token mismatch" on token-based
        // API calls. Auth is via Bearer JWT, so no session or CSRF is needed.

        // route-level permission guard: 'authorize:permission,scope'
        $middleware->alias([
            'authorize' => \App\Http\Middleware\Authorize::class,
            'ratelimit' => \App\Http\Middleware\RateLimit::class,
            'operator' => \App\Http\Middleware\RequireOperator::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Consistent JSON error envelope: { error: { code, message } }
        $exceptions->render(function (\Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($e instanceof \Illuminate\Validation\ValidationException) {
                return response()->json([
                    'error' => [
                        'code' => 'validation_error',
                        'message' => 'The given data was invalid.',
                        'details' => $e->errors(),
                    ],
                ], 422);
            }

            if ($e instanceof HttpException) {
                $status = $e->getStatusCode();
                $codes = [400 => 'bad_request', 401 => 'unauthorized', 403 => 'forbidden',
                          404 => 'not_found', 409 => 'conflict'];

                return response()->json([
                    'error' => [
                        'code' => $codes[$status] ?? 'error',
                        'message' => $e->getMessage() ?: ($codes[$status] ?? 'Error'),
                    ],
                ], $status);
            }

            if ($e instanceof \Illuminate\Database\QueryException && $e->getCode() === '23505') {
                return response()->json([
                    'error' => ['code' => 'conflict', 'message' => 'Resource already exists'],
                ], 409);
            }

            $status = 500;

            // Always log the real exception so it isn't silently swallowed.
            \Illuminate\Support\Facades\Log::error('Unhandled API exception: '.$e->getMessage(), [
                'exception' => get_class($e),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            // In debug mode, return the real message + location so it's visible
            // to the developer instead of a generic envelope.
            if (config('app.debug')) {
                return response()->json([
                    'error' => [
                        'code' => 'internal_error',
                        'message' => $e->getMessage(),
                        'exception' => get_class($e),
                        'file' => $e->getFile().':'.$e->getLine(),
                    ],
                ], $status);
            }

            return response()->json([
                'error' => ['code' => 'internal_error', 'message' => 'Something went wrong'],
            ], $status);
        });
    })
    ->create();
