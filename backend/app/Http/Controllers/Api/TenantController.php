<?php

namespace App\Http\Controllers\Api;

use App\Services\TenantService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TenantController extends Controller
{
    public function __construct(
        private TenantService $tenants,
        private \App\Services\TenantBillingService $billing
    ) {}

    public function current(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->tenants->current($request->attributes->get('tenantId'))]);
    }

    public function provision(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string',
            'slug' => 'required|string',
            'plan' => 'sometimes|string',
            'adminEmail' => 'sometimes|email',
            'adminPassword' => 'sometimes|string|min:8',
            'planCode' => 'sometimes|in:free,standard,premium',
            'paymentProvider' => 'sometimes|in:stripe,mpesa,manual',
        ]);

        return response()->json(['data' => $this->tenants->provision($data)], 201);
    }

    public function listAll(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->tenants->listAllTenants()]);
    }

    public function platformAnalytics(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->tenants->platformAnalytics()]);
    }

    public function platformActivity(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->tenants->platformActivity()]);
    }

    public function platformStats(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->tenants->platformStats()]);
    }

    public function setStatus(Request $request, string $tenantId): JsonResponse
    {
        $data = $request->validate(['status' => 'required|in:active,suspended']);
        return response()->json(['data' => $this->tenants->setTenantStatus($tenantId, $data['status'])]);
    }

    public function plans(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->billing->listPlans()]);
    }

    public function subscription(Request $request, string $tenantId): JsonResponse
    {
        return response()->json(['data' => $this->billing->tenantSubscription($tenantId)]);
    }
}
