<?php

namespace App\Http\Controllers\Api;

use App\Services\GradebookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GradebookController extends Controller
{
    public function __construct(private GradebookService $gradebook) {}

    public function listItems(Request $request): JsonResponse
    {
        $data = $request->validate(['courseId' => 'required|uuid']);

        return response()->json(['data' => $this->gradebook->listItems(
            $request->attributes->get('tenantId'), $data['courseId']
        )]);
    }

    public function createItem(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'itemType' => 'required|in:mod,manual,category,course',
            'categoryId' => 'sometimes|uuid',
            'moduleId' => 'sometimes|uuid',
            'name' => 'sometimes|string',
            'grademin' => 'sometimes|numeric',
            'grademax' => 'sometimes|numeric',
            'gradepass' => 'sometimes|numeric',
            'weight' => 'sometimes|numeric',
            'sortOrder' => 'sometimes|integer',
        ]);

        return response()->json(['data' => $this->gradebook->createItem(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function createCategory(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'parentId' => 'sometimes|uuid',
            'name' => 'sometimes|string',
            'aggregation' => 'sometimes|in:natural,mean,weighted_mean,simple_weighted_mean,median,min,max,mode',
            'dropLowest' => 'sometimes|integer|min:0',
            'keepHighest' => 'sometimes|integer|min:0',
        ]);

        return response()->json(['data' => $this->gradebook->createCategory(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function setGrade(Request $request): JsonResponse
    {
        $data = $request->validate([
            'gradeItemId' => 'required|uuid',
            'userId' => 'required|uuid',
            'rawgrade' => 'sometimes|nullable|numeric',
            'finalgrade' => 'sometimes|nullable|numeric',
            'feedback' => 'sometimes|array',
            'workflowState' => 'sometimes|in:notmarked,inmarking,complete,released',
            'source' => 'sometimes|in:manual,auto,regrade,import',
            'reason' => 'sometimes|string',
        ]);

        return response()->json(['data' => $this->gradebook->setGrade(
            $request->attributes->get('tenantId'), $data, $request->attributes->get('userId')
        )]);
    }

    public function recompute(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'userId' => 'required|uuid',
        ]);

        return response()->json(['data' => $this->gradebook->recomputeSummary(
            $request->attributes->get('tenantId'), $data['courseId'], $data['userId']
        )]);
    }

    public function summary(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'userId' => 'required|uuid',
        ]);

        $row = $this->gradebook->getSummary(
            $request->attributes->get('tenantId'), $data['courseId'], $data['userId']
        );
        if (! $row) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'No summary yet']], 404);
        }

        return response()->json(['data' => $row]);
    }

    /** The signed-in learner's own grades across all their courses. */
    public function myGrades(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->gradebook->gradesForUser(
            $request->attributes->get('tenantId'),
            $request->attributes->get('userId')
        )]);
    }
}
