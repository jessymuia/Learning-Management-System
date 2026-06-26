<?php

namespace App\Http\Controllers\Api;

use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function __construct(private NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        $unread = $request->query('unread') === 'true';

        return response()->json(['data' => $this->notifications->listForUser(
            $request->attributes->get('tenantId'), $request->attributes->get('userId'), $unread
        )]);
    }

    public function markRead(Request $request, string $id): JsonResponse
    {
        return response()->json(['data' => $this->notifications->markRead(
            $request->attributes->get('tenantId'), $id, $request->attributes->get('userId')
        )]);
    }
}
