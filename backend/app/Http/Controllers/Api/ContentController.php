<?php

namespace App\Http\Controllers\Api;

use App\Services\CourseAccessService;

use App\Services\ContentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContentController extends Controller
{
    public function __construct(
        private ContentService $content,
        private CourseAccessService $access
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['courseId' => 'required|uuid']);
        $this->access->assertAccess($request->attributes->get('tenantId'), $data['courseId'], $request->attributes->get('userId'));

        return response()->json(['data' => $this->content->listForCourse(
            $request->attributes->get('tenantId'), $data['courseId']
        )]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'kind' => 'required|in:video,page,file,url,book,folder',
            'title' => 'required|string',
            'body' => 'sometimes|array',
        ]);

        return response()->json(
            ['data' => $this->content->create($request->attributes->get('tenantId'), $data)],
            201
        );
    }
}
