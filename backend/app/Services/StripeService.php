<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * StripeService — real Stripe card payments (spec §8 payments, global).
 *
 * Implements the PaymentIntent flow:
 *   1. createPaymentIntent → calls Stripe, returns a client_secret the frontend
 *      confirms with Stripe.js (card never touches our server — PCI-safe).
 *   2. Webhook → Stripe POSTs payment_intent.succeeded to our endpoint; we
 *      verify the signature (HMAC over the raw body with the webhook secret),
 *      then mark the payment succeeded + order paid.
 *
 * STATUS: code-complete. Fires for real once these env vars are set:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * Without them, returns a clear "not configured" result instead of failing.
 */
class StripeService
{
    private function configured(): bool
    {
        return (bool) env('STRIPE_SECRET_KEY');
    }

    /** Step 1 — create a Stripe PaymentIntent; returns the client_secret. */
    public function createPaymentIntent(string $tenantId, string $paymentId, int $amountMinor, string $currency, array $metadata = []): array
    {
        if (! $this->configured()) {
            return [
                'configured' => false,
                'message' => 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable card payments.',
            ];
        }

        // Stripe amounts are in the smallest currency unit (cents) — same as amount_minor.
        $resp = Http::asForm()
            ->withToken(env('STRIPE_SECRET_KEY'))
            ->post('https://api.stripe.com/v1/payment_intents', [
                'amount' => $amountMinor,
                'currency' => strtolower($currency),
                'automatic_payment_methods' => ['enabled' => 'true'],
                'metadata' => array_merge(['payment_id' => $paymentId], $metadata),
            ]);

        if (! $resp->successful()) {
            Log::warning('[Stripe] intent creation failed: '.$resp->body());
            throw new HttpException(502, 'Card payment setup failed');
        }

        $body = $resp->json();

        // store Stripe's PaymentIntent id so the webhook can reconcile
        TenantContext::withTenant($tenantId, function () use ($paymentId, $body) {
            DB::statement(
                "UPDATE payments SET provider_ref = ?, raw = ?, status = 'pending' WHERE id = ?",
                [$body['id'] ?? null, json_encode($body), $paymentId]
            );
        });

        return [
            'configured' => true,
            'client_secret' => $body['client_secret'] ?? null,
            'payment_intent_id' => $body['id'] ?? null,
            'publishable_key' => env('STRIPE_PUBLISHABLE_KEY'),
        ];
    }

    /**
     * Step 2 — handle a Stripe webhook. The raw body + Stripe-Signature header
     * are required to verify authenticity before trusting anything.
     */
    public function handleWebhook(string $rawBody, string $signatureHeader): array
    {
        if (! $this->verifySignature($rawBody, $signatureHeader)) {
            throw new HttpException(400, 'Invalid Stripe signature');
        }

        $event = json_decode($rawBody, true);
        $type = $event['type'] ?? '';
        $object = $event['data']['object'] ?? [];
        $intentId = $object['id'] ?? null;

        return TenantContext::withSystem(function () use ($type, $intentId, $object) {
            $payment = DB::selectOne('SELECT id, order_id FROM payments WHERE provider_ref = ?', [$intentId]);
            if (! $payment) {
                Log::warning("[Stripe] webhook for unknown PaymentIntent: $intentId");

                return ['handled' => false];
            }

            if ($type === 'payment_intent.succeeded') {
                DB::statement("UPDATE payments SET status = 'succeeded', raw = ? WHERE id = ?",
                    [json_encode($object), $payment->id]);

                // fulfil: mark paid + GRANT ACCESS (auto-enrol) — spec's
                // payment→enrolment→access flow, same as the M-Pesa callback.
                $order = DB::selectOne(
                    'SELECT id, user_id, item_type, item_id, tenant_id, status, amount_minor FROM orders WHERE id = ?',
                    [$payment->order_id]
                );
                if ($order && $order->status !== 'paid') {
                    DB::statement("UPDATE orders SET status = 'paid' WHERE id = ?", [$payment->order_id]);
                    $this->grantOrderAccess($order);
                    DB::statement(
                        "INSERT INTO invoices (tenant_id, order_id, number, issued_at)
                         VALUES (?, ?, 'INV-' || substr(md5(random()::text), 1, 8), now())
                         ON CONFLICT DO NOTHING",
                        [$order->tenant_id, $order->id]
                    );
                    $this->notifyPaymentSuccess($order);
                }

                return ['handled' => true, 'status' => 'paid', 'order_id' => $payment->order_id];
            }

            if ($type === 'payment_intent.payment_failed') {
                DB::statement("UPDATE payments SET status = 'failed', raw = ? WHERE id = ?",
                    [json_encode($object), $payment->id]);

                return ['handled' => true, 'status' => 'failed'];
            }

            return ['handled' => true, 'status' => 'ignored', 'type' => $type];
        });
    }

    /**
     * Verify Stripe's signature: HMAC-SHA256 over "timestamp.rawBody" with the
     * webhook secret, compared to the v1 signature in the Stripe-Signature header.
     * Also rejects timestamps older than 5 minutes (replay protection).
     */
    public function verifySignature(string $rawBody, string $signatureHeader): bool
    {
        $secret = env('STRIPE_WEBHOOK_SECRET');
        if (! $secret) {
            return false;
        }
        // header looks like: t=timestamp,v1=signature,...
        $parts = [];
        foreach (explode(',', $signatureHeader) as $kv) {
            [$k, $v] = array_pad(explode('=', $kv, 2), 2, '');
            $parts[$k] = $v;
        }
        $timestamp = $parts['t'] ?? '';
        $sig = $parts['v1'] ?? '';
        if (! $timestamp || ! $sig) {
            return false;
        }
        // replay protection: reject if older than 5 minutes
        if (abs(time() - (int) $timestamp) > 300) {
            return false;
        }
        $expected = hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);

        return hash_equals($expected, $sig);
    }

    /** Enrol the buyer after a successful payment (course or program). */
    /** Notify buyer + managers of a successful payment (reuses notifications). */
    private function notifyPaymentSuccess(object $order): void
    {
        $title = 'your course';
        if ($order->item_type === 'course') {
            $row = DB::selectOne('SELECT fullname FROM courses WHERE id = ?', [$order->item_id]);
            $title = $row->fullname ?? 'your course';
        } elseif ($order->item_type === 'program') {
            $row = DB::selectOne('SELECT title FROM programs WHERE id = ?', [$order->item_id]);
            $title = $row->title ?? 'your program';
        }
        DB::statement(
            "INSERT INTO notifications (tenant_id, user_id, channel, type, payload)
             VALUES (?, ?, 'inapp', 'payment.success', ?)",
            [$order->tenant_id, $order->user_id, json_encode([
                'message' => "Your payment was successful. Access to \"$title\" has been granted.",
                'item_type' => $order->item_type, 'item_id' => $order->item_id,
            ])]
        );
        $managers = DB::select(
            "SELECT DISTINCT cra.user_id FROM context_role_assignments cra
               JOIN roles r ON r.id = cra.role_id AND r.name IN ('manager','tenant_admin')"
        );
        foreach ($managers as $m) {
            DB::statement(
                "INSERT INTO notifications (tenant_id, user_id, channel, type, payload)
                 VALUES (?, ?, 'inapp', 'payment.received', ?)",
                [$order->tenant_id, $m->user_id, json_encode([
                    'message' => "New payment received for \"$title\".",
                    'amount_minor' => $order->amount_minor ?? null,
                ])]
            );
        }
    }

    private function grantOrderAccess(object $order): void
    {
        if ($order->item_type === 'course') {
            $method = DB::selectOne(
                "SELECT id FROM enrolment_methods WHERE course_id = ? AND type = 'payment' LIMIT 1",
                [$order->item_id]
            );
            if (! $method) {
                $method = DB::selectOne(
                    "INSERT INTO enrolment_methods (tenant_id, course_id, type, enabled)
                     VALUES (?, ?, 'payment', true) RETURNING id",
                    [$order->tenant_id, $order->item_id]
                );
            }
            DB::statement(
                "INSERT INTO user_enrolments (tenant_id, method_id, user_id, course_id, status)
                 VALUES (?, ?, ?, ?, 'active')
                 ON CONFLICT (tenant_id, method_id, user_id) DO UPDATE SET status='active'",
                [$order->tenant_id, $method->id, $order->user_id, $order->item_id]
            );
        } else {
            DB::statement(
                "INSERT INTO program_enrolments (tenant_id, program_id, user_id, status)
                 VALUES (?, ?, ?, 'active')
                 ON CONFLICT (tenant_id, program_id, user_id) DO UPDATE SET status='active'",
                [$order->tenant_id, $order->item_id, $order->user_id]
            );
        }
    }
}
