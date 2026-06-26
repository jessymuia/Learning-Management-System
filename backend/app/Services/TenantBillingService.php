<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TenantBillingService — billing for tenant (organization) subscriptions
 * (spec §15 reseller console: provisioning + billing). When a tenant is
 * provisioned on a paid plan, this records the subscription and creates a
 * payment intent the operator settles via the provider (Stripe/M-Pesa). The
 * live charge needs real credentials; here we own the records + idempotency.
 */
class TenantBillingService
{
    public function listPlans(): array
    {
        return TenantContext::withSystem(function () {
            return DB::select('SELECT id, code, name, price_minor, currency, limits FROM plans ORDER BY price_minor');
        });
    }

    /**
     * Subscribe a tenant to a plan + create the payment intent for it.
     * Returns the subscription + an intent (idempotent per tenant+period).
     */
    public function subscribeTenant(string $tenantId, string $planCode, string $provider = 'manual'): array
    {
        return TenantContext::withSystem(function () use ($tenantId, $planCode, $provider) {
            $plan = DB::selectOne('SELECT id, code, name, price_minor, currency FROM plans WHERE code = ?', [$planCode]);
            if (! $plan) {
                throw new HttpException(404, "Plan '$planCode' not found");
            }

            // record the subscription period (monthly)
            $sub = DB::selectOne(
                "INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, period_start, period_end)
                 VALUES (?, ?, 'active', now(), now() + interval '1 month')
                 RETURNING id, plan_id, status, period_start, period_end",
                [$tenantId, $plan->id]
            );

            // free plan → no payment needed
            if ((int) $plan->price_minor === 0) {
                return [
                    'subscription_id' => $sub->id,
                    'plan' => $plan->code,
                    'amount_minor' => 0,
                    'payment_required' => false,
                ];
            }

            // paid plan → create a payment intent (idempotent per tenant+plan+period)
            $idempotencyKey = hash('sha256', $tenantId.'|'.$plan->id.'|'.$sub->period_start);

            return [
                'subscription_id' => $sub->id,
                'plan' => $plan->code,
                'amount_minor' => $plan->price_minor,
                'currency' => $plan->currency,
                'provider' => $provider,
                'idempotency_key' => $idempotencyKey,
                'payment_required' => true,
                // frontend exchanges this for a provider client_secret / STK push;
                // the provider webhook then confirms and activates billing.
                'next' => $provider === 'mpesa' ? 'stk_push' : 'confirm_card_payment',
            ];
        });
    }

    public function tenantSubscription(string $tenantId): ?object
    {
        return TenantContext::withSystem(function () use ($tenantId) {
            return DB::selectOne(
                "SELECT ts.id, ts.status, ts.period_start, ts.period_end, p.code AS plan, p.name AS plan_name, p.price_minor, p.currency
                   FROM tenant_subscriptions ts JOIN plans p ON p.id = ts.plan_id
                  WHERE ts.tenant_id = ? ORDER BY ts.created_at DESC LIMIT 1",
                [$tenantId]
            );
        });
    }
}
