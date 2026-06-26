<?php

namespace App\Http\Controllers\Api;

use App\Services\PrivacyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PrivacyController extends Controller
{
    public function __construct(private PrivacyService $privacy) {}

    public function exportMine(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->privacy->export(
            $request->attributes->get('tenantId'), $request->attributes->get('userId')
        )]);
    }

    public function eraseMe(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->privacy->erase(
            $request->attributes->get('tenantId'), $request->attributes->get('userId')
        )]);
    }

    public function consent(Request $request): JsonResponse
    {
        $data = $request->validate(['purpose' => 'required|string', 'granted' => 'required|boolean']);

        return response()->json(['data' => $this->privacy->recordConsent(
            $request->attributes->get('tenantId'), $request->attributes->get('userId'),
            $data['purpose'], $data['granted']
        )]);
    }
}
