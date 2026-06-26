<?php

namespace App\Http\Controllers\Api;

use App\Services\EnrolmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EnrolmentController extends Controller
{
    public function __construct(private EnrolmentService $enrolments) {}

    public function mine(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->enrolments->listForUser(
            $request->attributes->get('tenantId'),
            $request->attributes->get('userId')
        )]);
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['courseId' => 'required|uuid']);

        return response()->json(['data' => $this->enrolments->listForCourse(
            $request->attributes->get('tenantId'), $data['courseId']
        )]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'userId' => 'required|uuid',
            'type' => 'sometimes|in:manual,self,cohort,lti,payment,api',
        ]);

        return response()->json(
            ['data' => $this->enrolments->enrol($request->attributes->get('tenantId'), $data)],
            201
        );
    }

    public function suspend(Request $request, string $id): JsonResponse
    {
        return response()->json(
            ['data' => $this->enrolments->suspend($request->attributes->get('tenantId'), $id)]
        );
    }

    public function setStatus(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['status' => 'required|in:active,suspended']);
        return response()->json(['data' => $this->enrolments->setStatus(
            $request->attributes->get('tenantId'), $id, $data['status']
        )]);
    }

    public function selfEnrol(Request $request, string $courseId): JsonResponse
    {
        return response()->json(['data' => $this->enrolments->selfEnrol(
            $request->attributes->get('tenantId'), $courseId, $request->attributes->get('userId')
        )], 201);
    }
}
