<?php

namespace App\Http\Controllers\Api;

use App\Services\RbacService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function __construct(private RbacService $rbac) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->rbac->listRoles(
            $request->attributes->get('tenantId')
        )]);
    }

    public function assignments(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->rbac->listAssignments(
            $request->attributes->get('tenantId'), $request->query('instanceId')
        )]);
    }

    public function assign(Request $request): JsonResponse
    {
        $data = $request->validate([
            'userId' => 'required|uuid',
            'role' => 'required|in:tenant_admin,manager,teacher,ta,student',
            'level' => 'required|in:tenant,course',
            'instanceId' => 'required_if:level,course|uuid',
        ]);

        return response()->json(['data' => $this->rbac->assignRole(
            $request->attributes->get('tenantId'), $data['userId'], $data['role'],
            $data['level'], $data['instanceId'] ?? null
        )], 201);
    }

    public function revoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'userId' => 'required|uuid',
            'role' => 'required|string',
            'level' => 'required|in:tenant,course',
            'instanceId' => 'required_if:level,course|uuid',
        ]);
        $ok = $this->rbac->revokeRole(
            $request->attributes->get('tenantId'), $data['userId'], $data['role'],
            $data['level'], $data['instanceId'] ?? null
        );

        return response()->json(['data' => ['revoked' => $ok]]);
    }
}
