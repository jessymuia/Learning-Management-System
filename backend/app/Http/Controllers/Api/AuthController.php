<?php

namespace App\Http\Controllers\Api;

use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(private AuthService $auth) {}

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tenantSlug' => 'required|string',
            'email' => 'required|email',
            'password' => 'required|string|min:8',
            'profile' => 'sometimes|array',
        ]);

        $result = $this->auth->register(
            $data['tenantSlug'], $data['email'], $data['password'], $data['profile'] ?? []
        );

        return response()->json(['data' => $result], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tenantSlug' => 'required|string',
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        return response()->json([
            'data' => $this->auth->login($data['tenantSlug'], $data['email'], $data['password']),
        ]);
    }

    public function operatorLogin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        return response()->json([
            'data' => $this->auth->operatorLogin($data['email'], $data['password']),
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tenantSlug' => 'required|string',
            'email' => 'required|email',
        ]);

        $token = $this->auth->requestPasswordReset($data['tenantSlug'], $data['email']);

        // Always return success (no account enumeration). In production the token
        // is emailed; in dev we return it so the flow is testable without email.
        $resp = ['message' => 'If that account exists, a reset link has been sent.'];
        if ($token && config('app.debug')) {
            $resp['devToken'] = $token;
        }

        return response()->json(['data' => $resp]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => 'required|string',
            'password' => 'required|string|min:8',
        ]);

        $ok = $this->auth->resetPassword($data['token'], $data['password']);
        if (! $ok) {
            return response()->json(['error' => ['code' => 'invalid_token', 'message' => 'This reset link is invalid or has expired.']], 400);
        }

        return response()->json(['data' => ['message' => 'Your password has been reset. You can now sign in.']]);
    }

    public function refresh(Request $request): JsonResponse
    {
        $data = $request->validate(['refreshToken' => 'required|string']);

        return response()->json(['data' => $this->auth->refresh($data['refreshToken'])]);
    }

    public function me(Request $request): JsonResponse
    {
        $userId = $request->attributes->get('userId');
        $tenantId = $request->attributes->get('tenantId');

        // Is this user a platform super-admin? (control-plane identity)
        $op = \Illuminate\Support\Facades\DB::selectOne(
            'SELECT level FROM platform_operators WHERE user_id = ?',
            [$userId]
        );

        // What permissions does this user hold in the current tenant? Drives the
        // role-aware navigation (a student sees no teaching/admin tools, etc.).
        // Resolve assigned role names as well as permissions so the frontend can render the correct dashboard.
        $roles = [];
        $perms = [];
        if ($tenantId) {
            $rows = \App\Support\TenantContext::withTenant($tenantId, function () use ($userId) {
                return \Illuminate\Support\Facades\DB::select(
                    "SELECT DISTINCT p.name
                       FROM context_role_assignments cra
                       JOIN role_has_permissions rp ON rp.role_id = cra.role_id
                       JOIN permissions p ON p.id = rp.permission_id
                      WHERE cra.user_id = ?",
                    [$userId]
                );
            });
            $perms = array_map(fn ($r) => $r->name, $rows);

            $roleRows = \App\Support\TenantContext::withTenant($tenantId, function () use ($userId) {
                return \Illuminate\Support\Facades\DB::select(
                    "SELECT DISTINCT r.name FROM context_role_assignments cra JOIN roles r ON r.id = cra.role_id WHERE cra.user_id = ?",
                    [$userId]
                );
            });
            $roles = array_map(fn ($r) => $r->name, $roleRows);
        }

        return response()->json(['data' => [
            'userId' => $userId,
            'tenantId' => $tenantId,
            'email' => $request->attributes->get('email'),
            'isSuperAdmin' => $op !== null,
            'operatorLevel' => $op->level ?? null,
            'roles' => $roles,
            'permissions' => $perms,
        ]]);
    }
}
