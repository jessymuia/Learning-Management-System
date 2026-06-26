<?php

namespace App\Http\Controllers\Api;

use App\Services\GroupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GroupController extends Controller
{
    public function __construct(private GroupService $groups) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['courseId' => 'required|uuid']);

        return response()->json(['data' => $this->groups->listForCourse(
            $request->attributes->get('tenantId'), $data['courseId']
        )]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'name' => 'required|string',
            'description' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->groups->create(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function addMember(Request $request, string $groupId): JsonResponse
    {
        $data = $request->validate([
            'userId' => 'required|uuid',
            'role' => 'sometimes|in:member,leader',
        ]);

        return response()->json(['data' => $this->groups->addMember(
            $request->attributes->get('tenantId'), $groupId, $data
        )], 201);
    }

    public function listMembers(Request $request, string $groupId): JsonResponse
    {
        return response()->json(['data' => $this->groups->listMembers(
            $request->attributes->get('tenantId'), $groupId
        )]);
    }

    public function createGrouping(Request $request, string $courseId): JsonResponse
    {
        $data = $request->validate(['name' => 'required|string']);

        return response()->json(['data' => $this->groups->createGrouping(
            $request->attributes->get('tenantId'), $courseId, $data['name']
        )], 201);
    }

    public function gradeGroup(Request $request, string $groupId): JsonResponse
    {
        $data = $request->validate([
            'gradeItemId' => 'required|uuid',
            'grade' => 'required|numeric',
        ]);
        $count = $this->groups->propagateGroupGrade(
            $request->attributes->get('tenantId'), $groupId,
            $data['gradeItemId'], (float) $data['grade'], $request->attributes->get('userId')
        );

        return response()->json(['data' => ['members_graded' => $count]]);
    }
}
