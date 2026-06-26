<?php

namespace App\Http\Controllers\Api;

use App\Services\CategoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function __construct(private CategoryService $categories) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->categories->list($request->attributes->get('tenantId'))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string',
            'parentId' => 'sometimes|uuid',
            'sortOrder' => 'sometimes|integer',
        ]);

        return response()->json(
            ['data' => $this->categories->create($request->attributes->get('tenantId'), $data)],
            201
        );
    }
}
