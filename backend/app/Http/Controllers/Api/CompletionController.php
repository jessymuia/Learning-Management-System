<?php

namespace App\Http\Controllers\Api;

use App\Services\CourseAccessService;

use App\Services\CompletionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompletionController extends Controller
{
    public function __construct(
        private CompletionService $completion,
        private CourseAccessService $access
    ) {}

    public function markActivity(Request $request, string $moduleId): JsonResponse
    {
        $this->access->assertModuleAccess($request->attributes->get('tenantId'), $moduleId, $request->attributes->get('userId'));
        $data = $request->validate(['state' => 'required|integer|min:0|max:3']);
        $userId = $request->input('userId', $request->attributes->get('userId'));

        return response()->json(['data' => $this->completion->markActivity(
            $request->attributes->get('tenantId'), $moduleId, $userId, (int) $data['state']
        )]);
    }

    public function courseStatus(Request $request, string $courseId): JsonResponse
    {
        $this->access->assertAccess($request->attributes->get('tenantId'), $courseId, $request->attributes->get('userId'));
        $userId = $request->query('userId', $request->attributes->get('userId'));

        return response()->json(['data' => $this->completion->courseStatus(
            $request->attributes->get('tenantId'), $courseId, $userId
        )]);
    }
}
