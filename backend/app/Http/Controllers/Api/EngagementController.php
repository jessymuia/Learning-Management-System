<?php

namespace App\Http\Controllers\Api;

use App\Services\EngagementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EngagementController extends Controller
{
    public function __construct(private EngagementService $engagement) {}

    public function createChoice(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'name' => 'required|string',
            'options' => 'required|array|min:2',
            'allowMultiple' => 'sometimes|boolean',
            'anonymous' => 'sometimes|boolean',
        ]);

        return response()->json(['data' => $this->engagement->createChoice(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function respondChoice(Request $request, string $choiceId): JsonResponse
    {
        $data = $request->validate(['optionId' => 'required|string']);

        return response()->json(['data' => $this->engagement->respondChoice(
            $request->attributes->get('tenantId'), $choiceId,
            $request->attributes->get('userId'), $data['optionId']
        )], 201);
    }

    public function choiceResults(Request $request, string $choiceId): JsonResponse
    {
        return response()->json(['data' => $this->engagement->choiceResults(
            $request->attributes->get('tenantId'), $choiceId
        )]);
    }

    public function submitFeedback(Request $request, string $formId): JsonResponse
    {
        $data = $request->validate(['answers' => 'required|array']);

        return response()->json(['data' => $this->engagement->submitFeedback(
            $request->attributes->get('tenantId'), $formId,
            $request->attributes->get('userId'), $data['answers']
        )], 201);
    }
}
