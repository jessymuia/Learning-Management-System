<?php

namespace App\Http\Controllers\Api;

use App\Services\CourseAccessService;
use App\Services\ForumService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ForumController extends Controller
{
    public function __construct(private ForumService $forums, private CourseAccessService $access) {}

    public function listForums(Request $request): JsonResponse
    {
        $data = $request->validate(['courseId' => 'required|uuid']);

        return response()->json(['data' => $this->forums->listForums(
            $request->attributes->get('tenantId'), $data['courseId']
        )]);
    }

    public function createForum(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'name' => 'required|string',
            'intro' => 'sometimes|array',
            'type' => 'sometimes|in:general,news,qanda,single',
        ]);

        return response()->json(['data' => $this->forums->createForum(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function listDiscussions(Request $request, string $forumId): JsonResponse
    {
        $this->access->assertForumAccess($request->attributes->get('tenantId'), $forumId, $request->attributes->get('userId'));
        return response()->json(['data' => $this->forums->listDiscussions(
            $request->attributes->get('tenantId'), $forumId
        )]);
    }

    public function startDiscussion(Request $request, string $forumId): JsonResponse
    {
        $data = $request->validate([
            'subject' => 'required|string',
            'message' => 'required|array',
        ]);

        return response()->json(['data' => $this->forums->startDiscussion(
            $request->attributes->get('tenantId'), $forumId,
            $request->attributes->get('userId'), $data
        )], 201);
    }

    public function listPosts(Request $request, string $discussionId): JsonResponse
    {
        $this->access->assertDiscussionAccess($request->attributes->get('tenantId'), $discussionId, $request->attributes->get('userId'));
        return response()->json(['data' => $this->forums->listPosts(
            $request->attributes->get('tenantId'), $discussionId
        )]);
    }

    public function reply(Request $request, string $discussionId): JsonResponse
    {
        $data = $request->validate([
            'message' => 'required|array',
            'parentId' => 'sometimes|uuid',
        ]);

        return response()->json(['data' => $this->forums->reply(
            $request->attributes->get('tenantId'), $discussionId,
            $request->attributes->get('userId'), $data
        )], 201);
    }

    public function ratePost(Request $request, string $postId): JsonResponse
    {
        $data = $request->validate(['rating' => 'required|integer|min:-1|max:5']);

        return response()->json(['data' => $this->forums->ratePost(
            $request->attributes->get('tenantId'), $postId,
            $request->attributes->get('userId'), (int) $data['rating']
        )]);
    }

    public function markAnswer(Request $request, string $postId): JsonResponse
    {
        return response()->json(['data' => $this->forums->markAnswer(
            $request->attributes->get('tenantId'), $postId
        )]);
    }

    public function moderate(Request $request, string $discussionId): JsonResponse
    {
        $data = $request->validate(['pinned' => 'sometimes|boolean', 'locked' => 'sometimes|boolean']);

        return response()->json(['data' => $this->forums->moderateDiscussion(
            $request->attributes->get('tenantId'), $discussionId,
            $data['pinned'] ?? null, $data['locked'] ?? null
        )]);
    }
}
