<?php

namespace App\Http\Controllers\Api;

use App\Services\BackupService;
use App\Services\MeteringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * AdminController — control-plane operations (metering, backups, subscription).
 * Guarded by course.manage at tenant scope here; in production these sit behind
 * an operator/reseller role above the tenant.
 */
class AdminController extends Controller
{
    public function __construct(
        private MeteringService $metering,
        private BackupService $backups
    ) {}

    // ── Metering ──
    public function usage(Request $request): JsonResponse
    {
        $period = $request->query('period');

        return response()->json(['data' => $this->metering->usageForTenant(
            $request->attributes->get('tenantId'), $period
        )]);
    }

    public function recordUsage(Request $request): JsonResponse
    {
        $data = $request->validate([
            'metric' => 'required|string',
            'value' => 'required|integer',
            'period' => 'sometimes|date',
        ]);

        return response()->json(['data' => $this->metering->record(
            $request->attributes->get('tenantId'), $data['metric'], (int) $data['value'], $data['period'] ?? null
        )], 201);
    }

    public function subscription(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->metering->subscription(
            $request->attributes->get('tenantId')
        )]);
    }

    // ── Backups ──
    public function listBackups(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->backups->listForTenant(
            $request->attributes->get('tenantId')
        )]);
    }

    public function requestBackup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope' => 'required|in:course,tenant',
            'scopeId' => 'sometimes|uuid',
            'format' => 'sometimes|in:native,common_cartridge',
        ]);

        return response()->json(['data' => $this->backups->request(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }
}
