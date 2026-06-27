<?php

namespace App\Http\Controllers\Api;

use App\Services\CommerceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Support\TenantContext;

class CheckoutController extends Controller
{
    public function __construct(private CommerceService $commerceService)
    {
    }

    public function initiate(Request $request)
    {
        $validated = $request->validate([
            'itemType' => 'required|in:course,program',
            'itemId' => 'required|uuid',
            'provider' => 'required|in:stripe,mpesa,manual',
        ]);

        $user = auth()->user();
        $tenantId = $user->tenant_id ?? $request->input('tenant_id');

        // create order
        $item = TenantContext::withTenant($tenantId, function () use ($validated) {
            if ($validated['itemType'] === 'course') {
                return DB::selectOne('SELECT id, shortname, fullname FROM courses WHERE id = ?', [$validated['itemId']]);
            } else {
                return DB::selectOne('SELECT id, title FROM programs WHERE id = ?', [$validated['itemId']]);
            }
        });

        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }

        // check pricing
        $price = TenantContext::withTenant($tenantId, function () use ($validated, $item) {
            if ($validated['itemType'] === 'course') {
                $settings = DB::selectOne('SELECT settings FROM courses WHERE id = ?', [$validated['itemId']])?->settings ?? '{}';
                return json_decode($settings, true)['price_minor'] ?? 0;
            } else {
                $settings = DB::selectOne('SELECT pricing FROM programs WHERE id = ?', [$validated['itemId']])?->pricing ?? '{}';
                return json_decode($settings, true)['price_minor'] ?? 0;
            }
        });

        if ($price <= 0) {
            return response()->json(['error' => 'Item is not for sale'], 400);
        }

        // create order
        $order = $this->commerceService->createOrder($tenantId, $user->id, [
            'itemType' => $validated['itemType'],
            'itemId' => $validated['itemId'],
            'amountMinor' => $price,
            'currency' => 'KES',
        ]);

        // create payment intent
        $paymentIntent = $this->commerceService->createPaymentIntent(
            $tenantId,
            $order->id,
            $validated['provider']
        );

        return response()->json([
            'order' => $order,
            'payment' => $paymentIntent,
            'item' => $item,
        ]);
    }

    public function confirm(Request $request, string $orderId)
    {
        $validated = $request->validate([
            'provider' => 'required|in:stripe,mpesa,manual',
            'providerRef' => 'required|string',
            'status' => 'required|in:succeeded,failed,pending',
        ]);

        $user = auth()->user();
        $tenantId = $user->tenant_id ?? $request->input('tenant_id');

        $payment = $this->commerceService->recordPayment($tenantId, $orderId, $validated);

        return response()->json($payment);
    }
}
