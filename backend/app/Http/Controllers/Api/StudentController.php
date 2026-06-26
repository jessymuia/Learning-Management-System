<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\StudentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentController extends Controller
{
    public function __construct(private StudentService $student) {}

    public function myCourses(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->student->myCourses(
            $request->attributes->get('tenantId'),
            $request->attributes->get('userId')
        )]);
    }

    public function overview(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->student->overview(
            $request->attributes->get('tenantId'),
            $request->attributes->get('userId')
        )]);
    }
}
