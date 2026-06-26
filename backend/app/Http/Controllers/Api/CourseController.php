<?php

namespace App\Http\Controllers\Api;

use App\Services\CourseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CourseController extends Controller
{
    public function __construct(private CourseService $courses) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenantId');
        $rows = $this->courses->list($tenantId, $request->only(['status', 'categoryId', 'limit', 'offset']));

        return response()->json(['data' => $rows, 'meta' => ['count' => count($rows)]]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $row = $this->courses->getById($request->attributes->get('tenantId'), $id);
        if (! $row) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Course not found']], 404);
        }

        return response()->json(['data' => $row]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'categoryId' => 'required|uuid',
            'shortname' => 'required|string',
            'fullname' => 'required|string',
            'format' => 'sometimes|in:topics,weeks,single',
            'status' => 'sometimes|in:draft,active,archived',
            'summary' => 'sometimes|array',
            'isPaid' => 'sometimes|boolean',
            'priceMinor' => 'sometimes|integer|min:0',
            'currency' => 'sometimes|string|size:3',
        ]);

        return response()->json(
            ['data' => $this->courses->create($request->attributes->get('tenantId'), $data)],
            201
        );
    }

    public function update(Request $request, string $id): JsonResponse
    {
        return response()->json(
            ['data' => $this->courses->update($request->attributes->get('tenantId'), $id, $request->all())]
        );
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        return response()->json(
            ['data' => $this->courses->softDelete($request->attributes->get('tenantId'), $id)]
        );
    }
}
