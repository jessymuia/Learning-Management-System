<?php

namespace App\Http\Controllers\Api;

use App\Services\ThemingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ThemingController extends Controller
{
    public function __construct(private ThemingService $theming) {}

    // public: theme the login page by tenant slug (no auth)
    public function show(string $slug): JsonResponse
    {
        $b = $this->theming->getBranding($slug);
        if (! $b) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Tenant not found']], 404);
        }

        return response()->json(['data' => $b]);
    }

    // authed: branding for the current tenant (to theme the app shell)
    public function mine(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->theming->getForTenant(
            $request->attributes->get('tenantId')
        )]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'displayName' => 'sometimes|string',
            'logoUrl' => 'sometimes|url',
            'primaryColor' => ['sometimes', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'accentColor' => ['sometimes', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'defaultTheme' => 'sometimes|in:light,dark',
        ]);

        return response()->json(['data' => $this->theming->setBranding(
            $request->attributes->get('tenantId'), $data
        )]);
    }
}
