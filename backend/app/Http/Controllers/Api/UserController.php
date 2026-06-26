<?php

namespace App\Http\Controllers\Api;

use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    // GET /api/users — members of the caller's tenant (RLS guarantees same-tenant)
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenantId');

        $search = $request->query('search');
        $rows = TenantContext::withTenant($tenantId, function () use ($search) {
            if ($search) {
                return DB::select(
                    'SELECT u.id, u.email, tm.status, tm.idnumber, tm.joined_at
                       FROM tenant_memberships tm
                       JOIN users u ON u.id = tm.user_id
                      WHERE u.email ILIKE ?
                      ORDER BY u.email
                      LIMIT 25',
                    ['%'.str_replace('%', '', $search).'%']
                );
            }

            return DB::select(
                'SELECT u.id, u.email, tm.status, tm.idnumber, tm.joined_at
                   FROM tenant_memberships tm
                   JOIN users u ON u.id = tm.user_id
                  ORDER BY tm.joined_at DESC
                  LIMIT 100'
            );
        });

        return response()->json(['data' => $rows, 'meta' => ['count' => count($rows)]]);
    }

    // GET /api/users/{id}
    public function show(Request $request, string $id): JsonResponse
    {
        $tenantId = $request->attributes->get('tenantId');

        $row = TenantContext::withTenant($tenantId, function () use ($id) {
            return DB::selectOne(
                'SELECT u.id, u.email, tm.status, tm.idnumber, tm.joined_at
                   FROM tenant_memberships tm
                   JOIN users u ON u.id = tm.user_id
                  WHERE u.id = ?',
                [$id]
            );
        });

        if (! $row) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'User not found']], 404);
        }

        return response()->json(['data' => $row]);
    }
}
