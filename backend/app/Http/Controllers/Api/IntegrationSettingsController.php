<?php

namespace App\Http\Controllers\Api;

use App\Services\IntegrationSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationSettingsController extends Controller
{
    public function __construct(private IntegrationSettingsService $integrations) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->integrations->list(
            $request->attributes->get('tenantId')
        )]);
    }

    public function save(Request $request, string $provider): JsonResponse
    {
        // accept any fields; the service whitelists per provider
        return response()->json(['data' => $this->integrations->save(
            $request->attributes->get('tenantId'), $provider, $request->all(),
            $request->attributes->get('userId')
        )]);
    }
}
