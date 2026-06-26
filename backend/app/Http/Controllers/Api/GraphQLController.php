<?php

namespace App\Http\Controllers\Api;

use App\Services\GraphQLService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GraphQLController extends Controller
{
    public function __construct(private GraphQLService $graphql) {}

    public function query(Request $request): JsonResponse
    {
        $data = $request->validate([
            'query' => 'required|string',
            'variables' => 'sometimes|array',
        ]);

        $result = $this->graphql->execute(
            $request->attributes->get('tenantId'),
            $request->attributes->get('userId'),
            $data['query'],
            $data['variables'] ?? []
        );

        return response()->json($result);
    }
}
