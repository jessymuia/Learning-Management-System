<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * MeteringService — per-tenant usage metering (spec §9, §10). CONTROL PLANE:
 * usage_metering has RLS OFF (operator-level), so these run under withSystem.
 * Records metrics (active_users, storage_bytes, api_calls) per period for
 * billing and quota enforcement.
 */
class MeteringService
{
    /** Record a usage metric for a tenant in a period (YYYY-MM-DD).
     *  Append-only: usage_metering has no (tenant,metric,period) unique key, so
     *  each call inserts a row and reads SUM them. Matches the spec's
     *  append-only metering philosophy. */
    public function record(string $tenantId, string $metric, int $value, ?string $period = null): object
    {
        $period = $period ?: date('Y-m-01'); // default: first of current month

        return TenantContext::withSystem(function () use ($tenantId, $metric, $value, $period) {
            DB::statement(
                "INSERT INTO usage_metering (tenant_id, metric, value, period, recorded_at)
                 VALUES (?, ?, ?, ?, now())",
                [$tenantId, $metric, $value, $period]
            );

            // return the running total for this metric/period
            return DB::selectOne(
                'SELECT ? AS metric, ? AS period, COALESCE(SUM(value),0) AS value
                   FROM usage_metering WHERE tenant_id = ? AND metric = ? AND period = ?',
                [$metric, $period, $tenantId, $metric, $period]
            );
        });
    }

    /** Usage for a tenant across a period — summed (billing read). */
    public function usageForTenant(string $tenantId, ?string $period = null): array
    {
        $period = $period ?: date('Y-m-01');

        return TenantContext::withSystem(function () use ($tenantId, $period) {
            return DB::select(
                'SELECT metric, SUM(value) AS value, period FROM usage_metering
                  WHERE tenant_id = ? AND period = ? GROUP BY metric, period ORDER BY metric',
                [$tenantId, $period]
            );
        });
    }

    /** Current subscription/plan status for a tenant (control plane). */
    public function subscription(string $tenantId): ?object
    {
        return TenantContext::withSystem(function () use ($tenantId) {
            return DB::selectOne(
                "SELECT id, plan_id, status, period_start, period_end
                   FROM tenant_subscriptions
                  WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1",
                [$tenantId]
            );
        });
    }
}
