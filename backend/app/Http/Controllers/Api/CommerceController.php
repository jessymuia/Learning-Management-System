<?php

namespace App\Http\Controllers\Api;

use App\Services\CommerceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CommerceController extends Controller
{
    public function __construct(private CommerceService $commerce,
        private \App\Services\MpesaService $mpesa,
        private \App\Services\StripeService $stripe
    ) {}

    public function createOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'itemType' => 'required|in:course,program',
            'itemId' => 'required|uuid',
            'amountMinor' => 'required|integer|min:0',
            'currency' => 'required|string|size:3',
        ]);

        return response()->json(['data' => $this->commerce->createOrder(
            $request->attributes->get('tenantId'), $request->attributes->get('userId'), $data
        )], 201);
    }

    public function getOrder(Request $request, string $orderId): JsonResponse
    {
        $row = $this->commerce->getOrder($request->attributes->get('tenantId'), $orderId);
        if (! $row) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Order not found']], 404);
        }

        return response()->json(['data' => $row]);
    }

    /** The signed-in learner's own payment history (orders + payment status). */
    public function myOrders(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->commerce->listUserOrders(
            $request->attributes->get('tenantId'), $request->attributes->get('userId')
        )]);
    }

    /** Org-wide payments report (managers/admins): all orders + status. */
    public function tenantOrders(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->commerce->listTenantOrders(
            $request->attributes->get('tenantId')
        )]);
    }

    // Provider webhook target — in production this verifies the provider signature first.
    public function recordPayment(Request $request, string $orderId): JsonResponse
    {
        $data = $request->validate([
            'provider' => 'required|in:stripe,mpesa,manual',
            'providerRef' => 'required|string',
            'status' => 'required|in:succeeded,failed,pending',
            'raw' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->commerce->recordPayment(
            $request->attributes->get('tenantId'), $orderId, $data
        )]);
    }

    public function createIntent(Request $request, string $orderId): JsonResponse
    {
        $data = $request->validate([
            'provider' => 'required|in:stripe,mpesa,manual',
            'phone' => 'required_if:provider,mpesa|string',
        ]);
        $tenantId = $request->attributes->get('tenantId');

        $intent = $this->commerce->createPaymentIntent($tenantId, $orderId, $data['provider']);

        // For M-Pesa, fire the real Daraja STK push to the customer's phone.
        if ($data['provider'] === 'mpesa' && ! empty($data['phone'])) {
            $stk = $this->mpesa->stkPush(
                $tenantId,
                $intent['payment_id'],
                $data['phone'],
                (int) $intent['amount_minor'],
                substr($orderId, 0, 12)
            );
            $intent['mpesa'] = $stk;
        }

        return response()->json(['data' => $intent], 201);
    }

    /** Daraja callback target — Safaricom POSTs the STK result here (no auth). */
    public function mpesaCallback(Request $request): JsonResponse
    {
        // verify the callback genuinely came from Safaricom before trusting it
        $ok = $this->mpesa->verifyCallbackSource(
            $request->query('secret') ?? $request->header('X-Callback-Secret'),
            $request->ip()
        );
        if (! $ok) {
            return response()->json(['ResultCode' => 1, 'ResultDesc' => 'Rejected'], 403);
        }

        $this->mpesa->handleCallback($request->all());

        // Daraja expects this exact ack shape
        return response()->json(['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
    }

    /** Create a Stripe PaymentIntent for an order (card payment). */
    public function stripeIntent(Request $request, string $orderId): JsonResponse
    {
        $tenantId = $request->attributes->get('tenantId');
        $intent = $this->commerce->createPaymentIntent($tenantId, $orderId, 'stripe');
        $stripe = $this->stripe->createPaymentIntent(
            $tenantId, $intent['payment_id'], (int) $intent['amount_minor'],
            $intent['currency'] ?? 'usd', ['order_id' => $orderId]
        );

        return response()->json(['data' => array_merge($intent, ['stripe' => $stripe])], 201);
    }

    /** Stripe webhook target — Stripe POSTs payment events here (no auth; signature-verified). */
    public function stripeWebhook(Request $request): JsonResponse
    {
        $this->stripe->handleWebhook(
            $request->getContent(),               // RAW body (required for signature)
            $request->header('Stripe-Signature', '')
        );

        return response()->json(['received' => true]);
    }
}
