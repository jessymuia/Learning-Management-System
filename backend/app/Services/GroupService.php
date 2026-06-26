<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * GroupService — course groups + membership (spec Phase 3). Backs
 * group-restricted activities and group submission/grading.
 */
class GroupService
{
    public function create(string $tenantId, array $data): object
    {
        foreach (['courseId', 'name'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                'INSERT INTO groups (tenant_id, course_id, name, description)
                 VALUES (?, ?, ?, ?) RETURNING id, course_id, name, created_at',
                [
                    $tenantId, $data['courseId'], $data['name'],
                    isset($data['description']) ? json_encode($data['description']) : null,
                ]
            );
        });
    }

    public function listForCourse(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT id, name, created_at FROM groups WHERE course_id = ? ORDER BY name',
                [$courseId]
            );
        });
    }

    public function addMember(string $tenantId, string $groupId, array $data): object
    {
        if (empty($data['userId'])) {
            throw new HttpException(400, 'userId is required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $groupId, $data) {
            $group = DB::selectOne('SELECT id FROM groups WHERE id = ?', [$groupId]);
            if (! $group) {
                throw new HttpException(404, 'Group not found');
            }

            return DB::selectOne(
                "INSERT INTO group_members (tenant_id, group_id, user_id, role)
                 VALUES (?, ?, ?, COALESCE(?,'member'))
                 ON CONFLICT (tenant_id, group_id, user_id) DO UPDATE SET role = EXCLUDED.role
                 RETURNING group_id, user_id, role, joined_at",
                [$tenantId, $groupId, $data['userId'], $data['role'] ?? null]
            );
        });
    }

    public function listMembers(string $tenantId, string $groupId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($groupId) {
            return DB::select(
                'SELECT gm.user_id, u.email, gm.role, gm.joined_at
                   FROM group_members gm JOIN users u ON u.id = gm.user_id
                  WHERE gm.group_id = ? ORDER BY u.email',
                [$groupId]
            );
        });
    }

    /** Create a grouping (a named set of groups) for organizing group activities. */
    public function createGrouping(string $tenantId, string $courseId, string $name): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId, $name) {
            return DB::selectOne(
                'INSERT INTO groupings (tenant_id, course_id, name) VALUES (?, ?, ?)
                 RETURNING id, name, created_at',
                [$tenantId, $courseId, $name]
            );
        });
    }

    /** Group submission: one member submits on behalf of the group; the grade
     *  later propagates to all members (spec §5.7 group grading). */
    public function groupMembers(string $tenantId, string $groupId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($groupId) {
            return DB::select('SELECT user_id FROM group_members WHERE group_id = ?', [$groupId]);
        });
    }

    /** Propagate one grade to every member of a group (with per-member override
     *  possible later). Returns count of members graded. */
    public function propagateGroupGrade(string $tenantId, string $groupId, string $gradeItemId, float $grade, ?string $markerId): int
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $groupId, $gradeItemId, $grade, $markerId) {
            $members = DB::select('SELECT user_id FROM group_members WHERE group_id = ?', [$groupId]);
            foreach ($members as $m) {
                DB::statement(
                    "INSERT INTO grade_grades (tenant_id, grade_item_id, user_id, rawgrade, finalgrade, marker_id)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON CONFLICT (tenant_id, grade_item_id, user_id) DO UPDATE SET
                       rawgrade = EXCLUDED.rawgrade, finalgrade = EXCLUDED.finalgrade, marker_id = EXCLUDED.marker_id",
                    [$tenantId, $gradeItemId, $m->user_id, $grade, $grade, $markerId]
                );
            }
            return count($members);
        });
    }
}
