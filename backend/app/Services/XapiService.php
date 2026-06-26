<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * XapiService — xAPI (Experience API) statement pipeline (spec §8, §15).
 * Stores learning-experience statements (actor/verb/object/result/context) that
 * activities emit. In production these stream to an LRS / ClickHouse; here we
 * own the validated write path and bounded queries.
 *
 * Statement shape follows xAPI 1.0.3: actor + verb + object are required.
 */
class XapiService
{
    public function record(string $tenantId, array $stmt): object
    {
        foreach (['actor', 'verb', 'object'] as $req) {
            if (empty($stmt[$req])) {
                throw new HttpException(400, "xAPI statement requires '$req'");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $stmt) {
            return DB::selectOne(
                'INSERT INTO xapi_statements (tenant_id, actor, verb, object, result, context)
                 VALUES (?, ?, ?, ?, ?, ?)
                 RETURNING id, verb, stored_at',
                [
                    $tenantId,
                    json_encode($stmt['actor']),
                    json_encode($stmt['verb']),
                    json_encode($stmt['object']),
                    isset($stmt['result']) ? json_encode($stmt['result']) : null,
                    isset($stmt['context']) ? json_encode($stmt['context']) : null,
                ]
            );
        });
    }

    /** Bounded recent statements (audit/debug; analytics goes to the LRS). */
    public function recent(string $tenantId, int $limit = 100): array
    {
        $limit = min($limit, 500);

        return TenantContext::withTenant($tenantId, function () use ($limit) {
            return DB::select(
                'SELECT id, actor, verb, object, result, stored_at
                   FROM xapi_statements ORDER BY stored_at DESC LIMIT ?',
                [$limit]
            );
        });
    }
}
