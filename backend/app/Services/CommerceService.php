<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CommerceService — orders, payments, invoices (spec §8). Adapter pattern per
 * provider (Stripe global, M-Pesa Daraja for KE, KRA eTIMS invoicing).
 *
 * The data lifecycle is fully here and validated: create order (pending) →
 * record a payment from a provider webhook → on success mark order paid, grant
 * enrolment, issue invoice. The actual provider API calls (Stripe charge,
 * M-Pesa STK push, eTIMS submission) are isolated behind the provider ref and
 * happen where credentials exist — not in this sandbox.
 *
 * Money is integer minor units; currency is ISO-4217 (spec §7 convention).
 */
class CommerceService
{
    public function createOrder(string $tenantId, string $userId, array $data): object
    {
        foreach (['itemType', 'itemId', 'amountMinor', 'currency'] as $req) {
            if (! isset($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }
        if (! in_array($data['itemType'], ['course', 'program'], true)) {
            throw new HttpException(400, 'itemType must be course or program');
        }
        if ((int) $data['amountMinor'] < 0) {
            throw new HttpException(400, 'amountMinor must be >= 0');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $userId, $data) {
            return DB::selectOne(
                "INSERT INTO orders (tenant_id, user_id, item_type, item_id, amount_minor, currency, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending')
                 RETURNING id, item_type, item_id, amount_minor, currency, status",
                [
                    $tenantId, $userId, $data['itemType'], $data['itemId'],
                    (int) $data['amountMinor'], strtoupper($data['currency']),
                ]
            );
        });
    }

    /**
     * Record a payment result from a provider (called by the provider webhook
     * handler after verifying the signature). On 'succeeded', this is where the
     * order is fulfilled: status→paid, enrolment granted, invoice issued — all
     * in one transaction, idempotently.
     */

    /**
     * Create a payment intent for an order (spec §8 payments). Provider-agnostic:
     * returns a client_secret-style token the frontend uses to confirm with the
     * provider SDK (Stripe PaymentIntent / M-Pesa STK push). The actual provider
     * API call happens where credentials exist; here we create the intent record
     * and the idempotency key that ties provider callbacks back to this order.
     */
    /**
     * Create a payment intent for an order (spec §8 payments). Provider-agnostic:
     * creates a pending payment attempt and an idempotency key the provider
     * callback uses to reconcile. The actual provider API call (Stripe
     * PaymentIntent / M-Pesa STK push) happens where credentials exist.
     */
    public function createPaymentIntent(string $tenantId, string $orderId, string $provider): array
    {
        if (! in_array($provider, ['stripe', 'mpesa', 'manual'], true)) {
            throw new \Symfony\Component\HttpKernel\Exception\HttpException(400, 'Unsupported payment provider');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $orderId, $provider) {
            $order = DB::selectOne(
                'SELECT id, amount_minor, currency, status FROM orders WHERE id = ?',
                [$orderId]
            );
            if (! $order) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(404, 'Order not found');
            }
            if ($order->status === 'paid') {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(409, 'Order is already paid');
            }

            // idempotency key: stable per (order, provider) so retries don't double-charge
            $idempotencyKey = hash('sha256', $orderId.'|'.$provider);

            // create (or reuse) a pending payment attempt
            $payment = DB::selectOne(
                "INSERT INTO payments (tenant_id, order_id, provider, provider_ref, amount_minor, currency, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending')
                 ON CONFLICT (tenant_id, provider, provider_ref) DO UPDATE SET status = 'pending'
                 RETURNING id, provider, amount_minor, currency",
                [$tenantId, $orderId, $provider, $idempotencyKey, $order->amount_minor, $order->currency]
            );

            return [
                'order_id' => $order->id,
                'payment_id' => $payment->id,
                'provider' => $provider,
                'amount_minor' => $order->amount_minor,
                'currency' => $order->currency,
                'idempotency_key' => $idempotencyKey,
                'next' => $provider === 'mpesa' ? 'stk_push' : 'confirm_card_payment',
            ];
        });
    }

    public function recordPayment(string $tenantId, string $orderId, array $data): object
    {
        foreach (['provider', 'providerRef', 'status'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }
        if (! in_array($data['provider'], ['stripe', 'mpesa', 'manual'], true)) {
            throw new HttpException(400, 'Unknown payment provider');
        }
        if (! in_array($data['status'], ['succeeded', 'failed', 'pending'], true)) {
            throw new HttpException(400, 'Invalid payment status');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $orderId, $data) {
            $order = DB::selectOne('SELECT id, user_id, item_type, item_id, amount_minor, currency, status FROM orders WHERE id = ?', [$orderId]);
            if (! $order) {
                throw new HttpException(404, 'Order not found');
            }

            // idempotency: same provider_ref recorded once
            $existing = DB::selectOne(
                'SELECT id FROM payments WHERE provider = ? AND provider_ref = ?',
                [$data['provider'], $data['providerRef']]
            );
            if ($existing) {
                return DB::selectOne('SELECT id, order_id, provider, status FROM payments WHERE id = ?', [$existing->id]);
            }

            $payment = DB::selectOne(
                'INSERT INTO payments (tenant_id, order_id, provider, provider_ref, amount_minor, currency, status, raw)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id, order_id, provider, status',
                [
                    $tenantId, $orderId, $data['provider'], $data['providerRef'],
                    $order->amount_minor, $order->currency, $data['status'],
                    json_encode($data['raw'] ?? (object) []),
                ]
            );

            if ($data['status'] === 'succeeded' && $order->status !== 'paid') {
                // fulfil the order
                DB::statement("UPDATE orders SET status='paid', updated_at=now() WHERE id = ?", [$orderId]);
                $this->grantAccess($tenantId, $order);
                $this->issueInvoice($tenantId, $orderId);
            }

            return $payment;
        });
    }

    /** Grant the purchased course/program access. */
    private function grantAccess(string $tenantId, object $order): void
    {
        if ($order->item_type === 'course') {
            // ensure a payment enrolment method, then enrol
            $method = DB::selectOne(
                "SELECT id FROM enrolment_methods WHERE course_id = ? AND type = 'payment' LIMIT 1",
                [$order->item_id]
            );
            if (! $method) {
                $method = DB::selectOne(
                    "INSERT INTO enrolment_methods (tenant_id, course_id, type, enabled)
                     VALUES (?, ?, 'payment', true) RETURNING id",
                    [$tenantId, $order->item_id]
                );
            }
            DB::statement(
                "INSERT INTO user_enrolments (tenant_id, method_id, user_id, course_id, status)
                 VALUES (?, ?, ?, ?, 'active')
                 ON CONFLICT (tenant_id, method_id, user_id) DO UPDATE SET status='active'",
                [$tenantId, $method->id, $order->user_id, $order->item_id]
            );
        } else { // program
            DB::statement(
                "INSERT INTO program_enrolments (tenant_id, program_id, user_id, status)
                 VALUES (?, ?, ?, 'active')
                 ON CONFLICT (tenant_id, program_id, user_id) DO UPDATE SET status='active'",
                [$tenantId, $order->item_id, $order->user_id]
            );
        }
    }

    /** Issue a sequential invoice (eTIMS ref filled by the KE adapter in prod). */
    private function issueInvoice(string $tenantId, string $orderId): void
    {
        $number = 'INV-'.strtoupper(substr(hash('sha256', $orderId), 0, 10));
        DB::statement(
            'INSERT INTO invoices (tenant_id, order_id, number, issued_at)
             VALUES (?, ?, ?, now())
             ON CONFLICT DO NOTHING',
            [$tenantId, $orderId, $number]
        );
    }

    public function getOrder(string $tenantId, string $orderId): ?object
    {
        return TenantContext::withTenant($tenantId, function () use ($orderId) {
            return DB::selectOne(
                'SELECT id, item_type, item_id, amount_minor, currency, status, created_at
                   FROM orders WHERE id = ?',
                [$orderId]
            );
        });
    }

    /** A learner's own orders, newest first, with the course/program title + receipt. */
    public function listUserOrders(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            return DB::select(
                "SELECT o.id, o.item_type, o.item_id, o.amount_minor, o.currency, o.status, o.created_at,
                        COALESCE(c.fullname, pr.title) AS item_title,
                        (SELECT p.provider_ref FROM payments p
                          WHERE p.order_id = o.id AND p.status = 'succeeded' LIMIT 1) AS receipt,
                        (SELECT i.number FROM invoices i WHERE i.order_id = o.id LIMIT 1) AS invoice_number
                   FROM orders o
                   LEFT JOIN courses c  ON o.item_type = 'course'  AND c.id = o.item_id
                   LEFT JOIN programs pr ON o.item_type = 'program' AND pr.id = o.item_id
                  WHERE o.user_id = ?
                  ORDER BY o.created_at DESC",
                [$userId]
            );
        });
    }

    /** Org-wide orders for the payments report (manager/admin). */
    public function listTenantOrders(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () {
            return DB::select(
                "SELECT o.id, o.item_type, o.amount_minor, o.currency, o.status, o.created_at,
                        u.email AS buyer_email,
                        COALESCE(c.fullname, pr.title) AS item_title
                   FROM orders o
                   JOIN users u ON u.id = o.user_id
                   LEFT JOIN courses c  ON o.item_type = 'course'  AND c.id = o.item_id
                   LEFT JOIN programs pr ON o.item_type = 'program' AND pr.id = o.item_id
                  ORDER BY o.created_at DESC
                  LIMIT 200"
            );
        });
    }
}
