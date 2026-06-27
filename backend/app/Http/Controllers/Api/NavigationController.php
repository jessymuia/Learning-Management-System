<?php

namespace App\Http\Controllers\Api;

use App\Services\RoleResolver;
use Illuminate\Http\JsonResponse;

/**
 * Navigation/sidebar endpoint.
 * 
 * Returns role-specific menu structure.
 * Frontend uses this to render dynamic, role-aware sidebars.
 */
class NavigationController extends Controller
{
    /**
     * GET /api/navigation
     * 
     * Returns role-specific menu items.
     */
    public function index(): JsonResponse
    {
        $user = auth('api')->user();
        $tenantId = $user->current_tenant_id;

        $role = RoleResolver::getEffectiveRole($user, $tenantId);
        $navigation = RoleResolver::getNavigationStructure($role);

        return response()->json([
            'data' => [
                'role' => $role,
                'items' => $navigation,
            ],
        ]);
    }
}
