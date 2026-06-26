<?php

namespace App\Http\Controllers\Api;

use App\Services\AssignmentService;
use App\Services\CourseAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AssignmentController extends Controller
{
    public function __construct(
        private AssignmentService $assignments,
        private CourseAccessService $access
    ) {}

    public function listForCourse(Request $request): JsonResponse
    {
        $data = $request->validate(['courseId' => 'required|uuid']);
        return response()->json(['data' => $this->assignments->listForCourse(
            $request->attributes->get('tenantId'), $data['courseId']
        )]);
    }

        public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'title' => 'required|string',
            'instructions' => 'sometimes|array',
            'dueAt' => 'sometimes|date',
            'cutoffAt' => 'sometimes|date',
            'maxAttempts' => 'sometimes|integer|min:1',
            'submissionTypes' => 'sometimes|array',
            'blindMarking' => 'sometimes|boolean',
            'rubricId' => 'sometimes|uuid',
        ]);

        return response()->json(['data' => $this->assignments->create(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    /** Student-facing list of assignments for a course (read-only). */
    public function listForStudent(Request $request, string $courseId): JsonResponse
    {
        $this->access->assertAccess($request->attributes->get('tenantId'), $courseId, $request->attributes->get('userId'));
        return response()->json(['data' => $this->assignments->listForCourse(
            $request->attributes->get('tenantId'), $courseId
        )]);
    }

    public function saveSubmission(Request $request, string $assignmentId): JsonResponse
    {
        $data = $request->validate(['textContent' => 'sometimes|array']);

        return response()->json(['data' => $this->assignments->saveSubmission(
            $request->attributes->get('tenantId'), $assignmentId,
            $request->attributes->get('userId'), $data
        )]);
    }

    public function submit(Request $request, string $assignmentId): JsonResponse
    {
        return response()->json(['data' => $this->assignments->submit(
            $request->attributes->get('tenantId'), $assignmentId, $request->attributes->get('userId')
        )]);
    }

    public function grade(Request $request, string $submissionId): JsonResponse
    {
        $data = $request->validate([
            'workflowState' => 'sometimes|in:notmarked,inmarking,complete,released',
            'rubricScores' => 'sometimes|array',
            'feedback' => 'sometimes|array',
            'grade' => 'sometimes|nullable|numeric|min:0',
        ]);

        return response()->json(['data' => $this->assignments->grade(
            $request->attributes->get('tenantId'), $submissionId,
            $request->attributes->get('userId'), $data
        )]);
    }

    public function listForAssignment(Request $request, string $assignmentId): JsonResponse
    {
        return response()->json(['data' => $this->assignments->listForAssignment(
            $request->attributes->get('tenantId'), $assignmentId
        )]);
    }

    public function mySubmission(Request $request, string $assignmentId): JsonResponse
    {
        $this->access->assertAssignmentAccess($request->attributes->get('tenantId'), $assignmentId, $request->attributes->get('userId'));
        $row = $this->assignments->mySubmission(
            $request->attributes->get('tenantId'), $assignmentId, $request->attributes->get('userId')
        );

        return response()->json(['data' => $row]);
    }
}
