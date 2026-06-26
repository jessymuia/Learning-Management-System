<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Per-user notification preferences, stored in users.profile->'notifications'.
 * Channels: email, inapp. Categories: assignments, payments, courses, forums.
 */
class NotificationPrefsController extends Controller
{
    private const DEFAULTS = [
        'email_assignments' => true,
        'email_payments' => true,
        'email_courses' => true,
        'email_forums' => false,
        'inapp_assignments' => true,
        'inapp_payments' => true,
        'inapp_courses' => true,
        'inapp_forums' => true,
    ];

    public function show(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenantId');
        $userId = $request->attributes->get('userId');

        $prefs = TenantContext::withTenant($tenantId, function () use ($userId) {
            $row = DB::selectOne("SELECT profile->'notifications' AS prefs FROM users WHERE id = ?", [$userId]);
            $stored = $row && $row->prefs ? json_decode($row->prefs, true) : [];

            return array_merge(self::DEFAULTS, is_array($stored) ? $stored : []);
        });

        return response()->json(['data' => $prefs]);
    }

    public function update(Request $request): JsonResponse
    {
        $tenantId = $request->attributes->get('tenantId');
        $userId = $request->attributes->get('userId');

        $data = $request->validate(array_fill_keys(
            array_map(fn ($k) => $k, array_keys(self::DEFAULTS)),
            'sometimes|boolean'
        ));

        $merged = array_merge(self::DEFAULTS, $data);

        TenantContext::withTenant($tenantId, function () use ($userId, $merged) {
            DB::statement(
                "UPDATE users SET profile = jsonb_set(COALESCE(profile, '{}'), '{notifications}', ?::jsonb) WHERE id = ?",
                [json_encode($merged), $userId]
            );
        });

        return response()->json(['data' => $merged]);
    }
}
