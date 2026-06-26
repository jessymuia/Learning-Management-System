<?php

namespace App\Http\Controllers\Api;

use App\Services\AnnouncementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    public function __construct(private AnnouncementService $announcements) {}

    public function index(Request $request, string $courseId): JsonResponse
    {
        return response()->json(['data' => $this->announcements->listForCourse(
            $request->attributes->get('tenantId'), $courseId
        )]);
    }

    public function post(Request $request, string $courseId): JsonResponse
    {
        $data = $request->validate([
            'subject' => 'required|string',
            'body' => 'required|array',
        ]);

        return response()->json(['data' => $this->announcements->post(
            $request->attributes->get('tenantId'), $courseId,
            $request->attributes->get('userId'), $data['subject'], $data['body']
        )], 201);
    }
}
