<?php

namespace App\Http\Controllers\Api;

use App\Services\MessagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MessagingController extends Controller
{
    public function __construct(private MessagingService $messaging) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->messaging->listConversations(
            $request->attributes->get('tenantId'), $request->attributes->get('userId')
        )]);
    }

    public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            'memberIds' => 'required|array|min:1',
            'memberIds.*' => 'uuid',
            'title' => 'sometimes|string',
            'type' => 'sometimes|in:direct,group',
        ]);

        return response()->json(['data' => $this->messaging->createConversation(
            $request->attributes->get('tenantId'), $request->attributes->get('userId'),
            $data['memberIds'], $data['title'] ?? null, $data['type'] ?? 'direct'
        )], 201);
    }

    public function messages(Request $request, string $conversationId): JsonResponse
    {
        return response()->json(['data' => $this->messaging->listMessages(
            $request->attributes->get('tenantId'), $conversationId, $request->attributes->get('userId')
        )]);
    }

    public function send(Request $request, string $conversationId): JsonResponse
    {
        $data = $request->validate(['body' => 'required|array']);

        return response()->json(['data' => $this->messaging->send(
            $request->attributes->get('tenantId'), $conversationId,
            $request->attributes->get('userId'), $data['body']
        )], 201);
    }
}
