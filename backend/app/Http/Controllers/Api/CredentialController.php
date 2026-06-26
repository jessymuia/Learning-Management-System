<?php

namespace App\Http\Controllers\Api;

use App\Services\CredentialService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CredentialController extends Controller
{
    public function __construct(private CredentialService $credentials) {}

    public function define(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => 'required|in:badge,certificate',
            'name' => 'required|string',
            'sourceType' => 'required|in:course,program,criteria',
            'sourceId' => 'sometimes|uuid',
            'template' => 'sometimes|array',
            'criteria' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->credentials->defineCredential(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function issue(Request $request, string $definitionId): JsonResponse
    {
        $data = $request->validate([
            'userId' => 'required|uuid',
            'evidence' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->credentials->issue(
            $request->attributes->get('tenantId'), $definitionId, $data['userId'], $data['evidence'] ?? []
        )], 201);
    }

    public function mine(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->credentials->listForUser(
            $request->attributes->get('tenantId'), $request->attributes->get('userId')
        )]);
    }

    // Public verification — no auth.
    public function verify(string $code): JsonResponse
    {
        $row = $this->credentials->verify($code);
        if (! $row) {
            return response()->json(['error' => ['code' => 'not_found', 'message' => 'Credential not found']], 404);
        }

        return response()->json(['data' => $row]);
    }
}
