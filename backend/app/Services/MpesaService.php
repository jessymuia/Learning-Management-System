<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * MpesaService — real M-Pesa Daraja STK push (spec §8 payments, KE market).
 *
 * Implements the actual Safaricom Daraja flow:
 *   1. OAuth: get an access token (Basic auth with consumer key/secret)
 *   2. STK push: POST to /mpesa/stkpush/v1/processrequest with the password
 *      (base64 of shortcode+passkey+timestamp), amount, phone, and callback URL
 *   3. Callback: Safaricom POSTs the result to our callback endpoint, which we
 *      verify and use to finalize the payment + enrol the buyer.
 *
 * STATUS: code-complete. Fires for real as soon as these env vars are set:
 *   MPESA_ENV (sandbox|production), MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,
 *   MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL
 * Without them it returns a clear "not configured" result instead of failing.
 */
class MpesaService
{
    private function configured(): bool
    {
        return env('MPESA_CONSUMER_KEY') && env('MPESA_CONSUMER_SECRET')
            && env('MPESA_SHORTCODE') && env('MPESA_PASSKEY');
    }

    private function baseUrl(): string
    {
        return env('MPESA_ENV', 'sandbox') === 'production'
            ? 'https://api.safaricom.co.ke'
            : 'https://sandbox.safaricom.co.ke';
    }

    /** Step 1 — OAuth access token from Daraja. */
    private function accessToken(): string
    {
        $key = env('MPESA_CONSUMER_KEY');
        $secret = env('MPESA_CONSUMER_SECRET');

        $resp = Http::withBasicAuth($key, $secret)
            ->get($this->baseUrl().'/oauth/v1/generate?grant_type=client_credentials');

        if (! $resp->successful() || ! $resp->json('access_token')) {
            throw new HttpException(502, 'M-Pesa authentication failed');
        }

        return $resp->json('access_token');
    }

    /**
     * Step 2 — Trigger an STK push to the customer's phone.
     * @param string $phone  e.g. 2547XXXXXXXX (normalised here)
     * @return array the Daraja response incl. CheckoutRequestID
     */
    public function stkPush(string $tenantId, string $paymentId, string $phone, int $amountMinor, string $accountRef): array
    {
        if (! $this->configured()) {
            // No credentials yet — return a clear, non-fatal status.
            return [
                'configured' => false,
                'message' => 'M-Pesa is not configured. Set MPESA_* env vars to enable live STK push.',
            ];
        }

        $phone = $this->normalizePhone($phone);
        $shortcode = env('MPESA_SHORTCODE');
        $passkey = env('MPESA_PASSKEY');
        $timestamp = now()->format('YmdHis');
        $password = base64_encode($shortcode.$passkey.$timestamp);
        $amount = max(1, (int) round($amountMinor / 100)); // Daraja takes whole KES

        $resp = Http::withToken($this->accessToken())
            ->post($this->baseUrl().'/mpesa/stkpush/v1/processrequest', [
                'BusinessShortCode' => $shortcode,
                'Password' => $password,
                'Timestamp' => $timestamp,
                'TransactionType' => 'CustomerPayBillOnline',
                'Amount' => $amount,
                'PartyA' => $phone,
                'PartyB' => $shortcode,
                'PhoneNumber' => $phone,
                'CallBackURL' => env('MPESA_CALLBACK_URL'),
                'AccountReference' => substr($accountRef, 0, 12),
                'TransactionDesc' => 'Payment',
            ]);

        $body = $resp->json() ?? [];

        // store the CheckoutRequestID so the callback can reconcile
        if (! empty($body['CheckoutRequestID'])) {
            TenantContext::withTenant($tenantId, function () use ($paymentId, $body) {
                DB::statement(
                    "UPDATE payments SET provider_ref = ?, raw = ?, status = 'pending'
                      WHERE id = ?",
                    [$body['CheckoutRequestID'], json_encode($body), $paymentId]
                );
            });
        }

        return array_merge(['configured' => true], $body);
    }


    /**
     * Verify a callback genuinely came from Safaricom before trusting it.
     * Two layers (both optional, enabled by env):
     *   1. Shared secret in the callback URL path/query (MPESA_CALLBACK_SECRET)
     *   2. Source IP allowlist (MPESA_ALLOWED_IPS, comma-separated)
     * Returns true if all configured checks pass (or if none are configured,
     * in which case it logs a warning so you know it is unguarded).
     */
    public function verifyCallbackSource(?string $providedSecret, ?string $sourceIp): bool
    {
        $secret = env('MPESA_CALLBACK_SECRET');
        $allowedIps = env('MPESA_ALLOWED_IPS');

        if (! $secret && ! $allowedIps) {
            \Illuminate\Support\Facades\Log::warning('[Mpesa] callback received but no verification configured (set MPESA_CALLBACK_SECRET and/or MPESA_ALLOWED_IPS)');
            return true; // not configured — allow, but warned
        }

        if ($secret) {
            if (! $providedSecret || ! hash_equals($secret, $providedSecret)) {
                return false;
            }
        }
        if ($allowedIps && $sourceIp) {
            $list = array_map('trim', explode(',', $allowedIps));
            if (! in_array($sourceIp, $list, true)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Step 3 — Handle the Daraja callback. Safaricom POSTs the result here.
     * ResultCode 0 = success. We finalize the payment + mark the order paid.
     */
    public function handleCallback(array $payload): array
    {
        // Daraja nests under Body.stkCallback
        $cb = $payload['Body']['stkCallback'] ?? null;
        if (! $cb) {
            throw new HttpException(400, 'Malformed M-Pesa callback');
        }
        $checkoutId = $cb['CheckoutRequestID'] ?? null;
        $resultCode = $cb['ResultCode'] ?? null;

        return TenantContext::withSystem(function () use ($checkoutId, $resultCode, $cb) {
            $payment = DB::selectOne('SELECT id, order_id, tenant_id FROM payments WHERE provider_ref = ?', [$checkoutId]);
            if (! $payment) {
                Log::warning("[Mpesa] callback for unknown CheckoutRequestID: $checkoutId");

                return ['handled' => false];
            }

            if ((int) $resultCode === 0) {
                // success — extract the receipt + finalize
                $receipt = null;
                foreach ($cb['CallbackMetadata']['Item'] ?? [] as $item) {
                    if (($item['Name'] ?? '') === 'MpesaReceiptNumber') {
                        $receipt = $item['Value'] ?? null;
                    }
                }
                DB::statement(
                    "UPDATE payments SET status = 'succeeded', raw = ? WHERE id = ?",
                    [json_encode($cb), $payment->id]
                );

                // fulfil the order: mark paid + GRANT ACCESS (auto-enrol the buyer).
                // This is the spec's "payment verified → enrolment created → access".
                $order = DB::selectOne(
                    'SELECT id, user_id, item_type, item_id, tenant_id, status, amount_minor FROM orders WHERE id = ?',
                    [$payment->order_id]
                );
                if ($order && $order->status !== 'paid') {
                    DB::statement("UPDATE orders SET status = 'paid' WHERE id = ?", [$payment->order_id]);
                    $this->grantOrderAccess($order);
                    $this->issuePaymentInvoice($order, $receipt);
                    $this->notifyPaymentSuccess($order);
                }

                return ['handled' => true, 'status' => 'paid', 'receipt' => $receipt, 'order_id' => $payment->order_id];
            }

            // failure / cancellation
            DB::statement("UPDATE payments SET status = 'failed', raw = ? WHERE id = ?", [json_encode($cb), $payment->id]);

            return ['handled' => true, 'status' => 'failed', 'result_code' => $resultCode];
        });
    }

    /** Normalise 07XX / +2547XX / 2547XX to the 2547XXXXXXXX Daraja expects. */
    private function normalizePhone(string $phone): string
    {
        $p = preg_replace('/\D/', '', $phone);
        if (str_starts_with($p, '0')) {
            $p = '254'.substr($p, 1);
        } elseif (str_starts_with($p, '7') || str_starts_with($p, '1')) {
            $p = '254'.$p;
        } elseif (str_starts_with($p, '2547') || str_starts_with($p, '2541')) {
            // already correct
        }

        return $p;
    }

    /**
     * Grant access after a successful payment: enrol the buyer into the course
     * or program the order was for. Mirrors CommerceService::grantAccess so a
     * real M-Pesa callback completes the spec's payment→enrolment→access flow.
     */
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
        } else { // program
            DB::statement(
                "INSERT INTO program_enrolments (tenant_id, program_id, user_id, status)
                 VALUES (?, ?, ?, 'active')
                 ON CONFLICT (tenant_id, program_id, user_id) DO UPDATE SET status='active'",
                [$order->tenant_id, $order->item_id, $order->user_id]
            );
        }
    }

    /** Notify the buyer (and the org's managers) that payment succeeded and
     *  access was granted. Reuses the notifications ledger (inapp channel). */
    private function notifyPaymentSuccess(object $order): void
    {
        // resolve a human title for the purchased item
        $title = 'your course';
        if ($order->item_type === 'course') {
            $row = DB::selectOne('SELECT fullname FROM courses WHERE id = ?', [$order->item_id]);
            $title = $row->fullname ?? 'your course';
        } elseif ($order->item_type === 'program') {
            $row = DB::selectOne('SELECT title FROM programs WHERE id = ?', [$order->item_id]);
            $title = $row->title ?? 'your program';
        }

        // student notification
        DB::statement(
            "INSERT INTO notifications (tenant_id, user_id, channel, type, payload)
             VALUES (?, ?, 'inapp', 'payment.success', ?)",
            [$order->tenant_id, $order->user_id, json_encode([
                'message' => "Your payment was successful. Access to \"$title\" has been granted.",
                'item_type' => $order->item_type, 'item_id' => $order->item_id,
            ])]
        );

        // notify the org's managers/admins ("New course payment received")
        $managers = DB::select(
            "SELECT DISTINCT cra.user_id
               FROM context_role_assignments cra
               JOIN roles r ON r.id = cra.role_id AND r.name IN ('manager','tenant_admin')",
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

    /** Issue an invoice/receipt record for a fulfilled order. */
    private function issuePaymentInvoice(object $order, ?string $receipt): void
    {
        DB::statement(
            "INSERT INTO invoices (tenant_id, order_id, number, issued_at)
             VALUES (?, ?, 'INV-' || substr(md5(random()::text), 1, 8), now())
             ON CONFLICT DO NOTHING",
            [$order->tenant_id, $order->id]
        );
    }
}
