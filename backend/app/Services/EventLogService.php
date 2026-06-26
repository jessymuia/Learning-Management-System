<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * EventLogService — the append-only activity/audit stream (spec §7.5, §9).
 * Tenant-scoped (RLS on), time-partitioned by month. This is the single largest
 * table; in production it streams to ClickHouse for OLAP. Here we own the write
 * path and bounded reads; never report off this table at scale (use marts).
 */
class EventLogService
{
    public function record(string $tenantId, array $data): void
    {
        TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            DB::statement(
                'INSERT INTO event_log
                   (tenant_id, user_id, course_id, context_id, event_name, target, object_id, data)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $tenantId, $data['userId'] ?? null, $data['courseId'] ?? null,
                    $data['contextId'] ?? null, $data['eventName'],
                    $data['target'] ?? null, $data['objectId'] ?? null,
                    json_encode($data['data'] ?? (object) []),
                ]
            );
        });
    }

    /** Bounded recent events for a course (audit view, not analytics). */
    public function recentForCourse(string $tenantId, string $courseId, int $limit = 100): array
    {
        $limit = min($limit, 500);

        return TenantContext::withTenant($tenantId, function () use ($courseId, $limit) {
            return DB::select(
                'SELECT id, user_id, event_name, target, object_id, created_at
                   FROM event_log WHERE course_id = ? ORDER BY created_at DESC LIMIT ?',
                [$courseId, $limit]
            );
        });
    }
}
