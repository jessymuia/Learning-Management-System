<?php

namespace App\Http\Controllers\Api;

use App\Services\AvailabilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AvailabilityController extends Controller
{
    public function __construct(private AvailabilityService $availability) {}

    public function checkModule(Request $request, string $moduleId): JsonResponse
    {
        $userId = $request->query('userId', $request->attributes->get('userId'));

        return response()->json(['data' => $this->availability->isModuleAvailable(
            $request->attributes->get('tenantId'), $moduleId, $userId
        )]);
    }
}
