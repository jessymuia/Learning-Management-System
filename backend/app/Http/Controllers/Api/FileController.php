<?php

namespace App\Http\Controllers\Api;

use App\Services\CourseAccessService;
use App\Services\FileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FileController extends Controller
{
    public function __construct(private FileService $files, private CourseAccessService $access) {}

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'contenthash' => 'required|string|size:64',
            'component' => 'required|string',
            'filearea' => 'required|string',
            'contextId' => 'required|uuid',
            'itemId' => 'required|uuid',
            'filename' => 'required|string',
            'filesize' => 'required|integer|min:0',
            'mimetype' => 'sometimes|string',
        ]);

        return response()->json(['data' => $this->files->register(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function signedUrl(Request $request, string $fileId): JsonResponse
    {
        $this->access->assertFileAccess($request->attributes->get('tenantId'), $fileId, $request->attributes->get('userId'));
        return response()->json(['data' => $this->files->signedUrl(
            $request->attributes->get('tenantId'), $fileId
        )]);
    }
}
