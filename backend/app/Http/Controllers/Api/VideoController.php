<?php

namespace App\Http\Controllers\Api;

use App\Services\VideoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VideoController extends Controller
{
    public function __construct(private VideoService $videos) {}

    public function attach(Request $request): JsonResponse
    {
        $data = $request->validate([
            'contentId' => 'required|uuid',
            'provider' => 'required|in:youtube,vimeo,mux,cloudflare_stream,self',
            'externalId' => 'sometimes|string',
            'url' => 'sometimes|url',
            'gated' => 'sometimes|boolean',
            'durationS' => 'sometimes|integer|min:0',
            'captions' => 'sometimes|array',
            'metadata' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->videos->attachVideo(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function playback(Request $request, string $videoId): JsonResponse
    {
        return response()->json(['data' => $this->videos->playbackInfo(
            $request->attributes->get('tenantId'), $videoId
        )]);
    }
}
