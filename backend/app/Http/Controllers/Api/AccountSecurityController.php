<?php

namespace App\Http\Controllers\Api;

use App\Services\SsoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountSecurityController extends Controller
{
    public function __construct(private SsoService $sso) {}

    public function enableMfa(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->sso->enableTotp(
            $request->attributes->get('tenantId'), $request->attributes->get('userId')
        )], 201);
    }

    public function verifyMfa(Request $request): JsonResponse
    {
        $data = $request->validate(['secret' => 'required|string', 'code' => 'required|string']);
        $ok = $this->sso->verifyTotp($data['secret'], $data['code']);

        return response()->json(['data' => ['valid' => $ok]]);
    }
}
