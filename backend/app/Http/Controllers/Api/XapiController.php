<?php

namespace App\Http\Controllers\Api;

use App\Services\XapiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class XapiController extends Controller
{
    public function __construct(private XapiService $xapi) {}

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'actor' => 'required|array',
            'verb' => 'required|array',
            'object' => 'required|array',
            'result' => 'sometimes|array',
            'context' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->xapi->record(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function recent(Request $request): JsonResponse
    {
        $limit = (int) $request->query('limit', 100);

        return response()->json(['data' => $this->xapi->recent(
            $request->attributes->get('tenantId'), $limit
        )]);
    }
}
