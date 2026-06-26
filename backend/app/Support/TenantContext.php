<?php

namespace App\Support;

use Closure;
use Illuminate\Support\Facades\DB;

/**
 * TenantContext — the single most load-bearing piece of the security model.
 *
 * Every tenant-scoped query MUST run inside a transaction that has:
 *   1. connected as a NON-OWNER role (lms_app) so RLS is enforced, and
 *   2. set `app.current_tenant` to the caller's tenant id (transaction-local).
 *
 * If either is skipped, PostgreSQL Row-Level Security silently returns
 * everything / nothing. We centralise the contract here; controllers and
 * services never issue tenant data queries outside withTenant()/withSystem().
 *
 * The DB connection must use the lms_app role (see config/database.php + .env).
 */
class TenantContext
{
    /**
     * Run $callback inside a transaction scoped to one tenant. Sets
     * app.current_tenant for the duration; RLS filters every tenant table on it.
     *
     * @template T
     * @param  string  $tenantId  UUID of the active tenant
     * @param  Closure():T  $callback
     * @return T
     */
    public static function withTenant(string $tenantId, Closure $callback)
    {
        if ($tenantId === '') {
            throw new \InvalidArgumentException('withTenant: tenantId is required');
        }

        return DB::transaction(function () use ($tenantId, $callback) {
            // transaction-local (third arg true): resets at COMMIT/ROLLBACK
            DB::statement("SELECT set_config('app.current_tenant', ?, true)", [$tenantId]);

            return $callback();
        });
    }

    /**
     * Run $callback with RLS BYPASSED — only for trusted, cross-tenant work
     * (global identity lookup during login/registration, control-plane, ETL).
     * Sets app.bypass_rls within the transaction.
     *
     * @template T
     * @param  Closure():T  $callback
     * @return T
     */
    public static function withSystem(Closure $callback)
    {
        return DB::transaction(function () use ($callback) {
            DB::statement("SELECT set_config('app.bypass_rls', 'on', true)");

            return $callback();
        });
    }
}
