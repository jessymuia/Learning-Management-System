<?php

namespace App\Http\Controllers\Api;

use App\Services\CalendarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    public function __construct(private CalendarService $calendar) {}

    public function agenda(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->calendar->agenda(
            $request->attributes->get('tenantId'), $request->attributes->get('userId'),
            $request->query('from'), $request->query('to')
        )]);
    }

    public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope' => 'required|in:site,course,user,group',
            'name' => 'required|string',
            'startAt' => 'required|date',
            'endAt' => 'sometimes|date',
            'courseId' => 'sometimes|uuid',
            'groupId' => 'sometimes|uuid',
            'moduleId' => 'sometimes|uuid',
            'description' => 'sometimes|string',
        ]);
        // default user-scope events to self
        if ($data['scope'] === 'user') {
            $data['userId'] = $request->attributes->get('userId');
        }

        return response()->json(['data' => $this->calendar->create(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }
}
