<?php

namespace App\Http\Controllers\Api;

use App\Services\ProgramService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProgramController extends Controller
{
    public function __construct(private ProgramService $programs) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->programs->list($request->attributes->get('tenantId'))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'slug' => 'required|string',
            'title' => 'required|string',
            'status' => 'sometimes|in:draft,active,archived',
            'minElectives' => 'sometimes|integer|min:0',
            'credential' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->programs->create(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function addCourse(Request $request, string $programId): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'requirement' => 'sometimes|in:required,elective',
            'electiveGroup' => 'sometimes|string',
            'sortOrder' => 'sometimes|integer',
            'unlockRule' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->programs->addCourse(
            $request->attributes->get('tenantId'), $programId, $data
        )], 201);
    }

    public function enrol(Request $request, string $programId): JsonResponse
    {
        $data = $request->validate([
            'userId' => 'sometimes|uuid',
            'cohortId' => 'sometimes|uuid',
        ]);
        // self-enrol if no userId given
        $userId = $data['userId'] ?? $request->attributes->get('userId');

        return response()->json(['data' => $this->programs->enrol(
            $request->attributes->get('tenantId'), $programId, $userId, $data['cohortId'] ?? null
        )], 201);
    }

    public function recompute(Request $request, string $programId): JsonResponse
    {
        $data = $request->validate(['userId' => 'required|uuid']);

        return response()->json(['data' => $this->programs->recomputeProgress(
            $request->attributes->get('tenantId'), $programId, $data['userId']
        )]);
    }

    public function progress(Request $request, string $programId): JsonResponse
    {
        $userId = $request->query('userId', $request->attributes->get('userId'));
        $row = $this->programs->getProgress(
            $request->attributes->get('tenantId'), $programId, $userId
        );

        return response()->json(['data' => $row]);
    }

    public function units(Request $request, string $programId): JsonResponse
    {
        return response()->json(['data' => $this->programs->listCourses(
            $request->attributes->get('tenantId'), $programId
        )]);
    }
}
