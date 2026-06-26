<?php

namespace App\Http\Controllers\Api;

use App\Services\ReportingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReportingController extends Controller
{
    public function __construct(private ReportingService $reports) {}

    public function courseOverview(Request $request, string $courseId): JsonResponse
    {
        return response()->json(['data' => $this->reports->courseOverview(
            $request->attributes->get('tenantId'), $courseId
        )]);
    }

    public function atRisk(Request $request, string $courseId): JsonResponse
    {
        $threshold = (float) $request->query('threshold', 50);

        return response()->json(['data' => $this->reports->atRiskLearners(
            $request->attributes->get('tenantId'), $courseId, $threshold
        )]);
    }

    public function orgOverview(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->reports->orgOverview(
            $request->attributes->get('tenantId')
        )]);
    }

    public function teacherActivity(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->reports->teacherActivity(
            $request->attributes->get('tenantId')
        )]);
    }

    public function orgActivity(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->reports->orgActivity(
            $request->attributes->get('tenantId')
        )]);
    }

    public function trends(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->reports->trends(
            $request->attributes->get('tenantId')
        )]);
    }

    public function tenantOverview(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->reports->tenantOverview(
            $request->attributes->get('tenantId')
        )]);
    }
}
