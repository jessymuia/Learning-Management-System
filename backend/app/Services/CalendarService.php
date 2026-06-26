<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CalendarService — dated events across scopes (spec §3 Phase 3, §15).
 * scope = site|course|user|group; due-date sync writes course events. Returns a
 * unified feed for a user (their own + their courses' + site-wide).
 */
class CalendarService
{
    public function create(string $tenantId, array $data): object
    {
        foreach (['scope', 'name', 'startAt'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }
        if (! in_array($data['scope'], ['site', 'course', 'user', 'group'], true)) {
            throw new HttpException(400, 'Invalid scope');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                'INSERT INTO calendar_events
                   (tenant_id, scope, course_id, user_id, group_id, module_id, name, description, start_at, end_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id, scope, name, start_at, end_at',
                [
                    $tenantId, $data['scope'], $data['courseId'] ?? null, $data['userId'] ?? null,
                    $data['groupId'] ?? null, $data['moduleId'] ?? null, $data['name'],
                    $data['description'] ?? null, $data['startAt'], $data['endAt'] ?? null,
                ]
            );
        });
    }

    /** A user's agenda: their events + site events + events for their courses. */
    public function agenda(string $tenantId, string $userId, ?string $from = null, ?string $to = null): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId, $from, $to) {
            $params = [$userId, $userId];
            $window = '';
            if ($from) {
                $window .= ' AND start_at >= ?';
                $params[] = $from;
            }
            if ($to) {
                $window .= ' AND start_at <= ?';
                $params[] = $to;
            }

            return DB::select(
                "SELECT id, scope, course_id, name, description, start_at, end_at
                   FROM calendar_events
                  WHERE (scope = 'site'
                         OR (scope = 'user' AND user_id = ?)
                         OR (scope = 'course' AND course_id IN (
                              SELECT course_id FROM user_enrolments WHERE user_id = ? AND status = 'active')))
                        $window
                  ORDER BY start_at",
                $params
            );
        });
    }
}
