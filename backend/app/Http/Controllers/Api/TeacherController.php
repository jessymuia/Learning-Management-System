<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TeacherService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TeacherController extends Controller
{
    public function __construct(private TeacherService $teacher) {}

    public function myCourses(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->teacher->myCourses(
            $request->attributes->get('tenantId'),
            $request->attributes->get('userId')
        )]);
    }

    public function overview(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->teacher->overview(
            $request->attributes->get('tenantId'),
            $request->attributes->get('userId')
        )]);
    }

    public function students(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->teacher->students(
            $request->attributes->get('tenantId'),
            $request->attributes->get('userId')
        )]);
    }
}
