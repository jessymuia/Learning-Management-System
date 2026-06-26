<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * RbacService — the "crown jewel": contextual permission resolution.
 *
 * Given (user, target context), walk the context tree once via ltree, gather the
 * roles the user holds at every ancestor-or-self context, union their
 * permissions, then subtract any deny overrides. Mirrors the SQL
 * `effective_permissions` oracle validated against the live database.
 *
 * All methods must be called inside a TenantContext::withTenant() transaction
 * (RLS already scoped to the tenant).
 */
class RbacService
{
    /**
     * The set of permission names a user effectively holds at a context.
     *
     * @return array<int,string>
     */
    public function effectivePermissions(string $userId, string $contextId): array
    {
        $granted = DB::select(
            "WITH target AS (
               SELECT tenant_id, path FROM contexts WHERE id = ?
             ),
             granted_roles AS (
               SELECT DISTINCT cra.role_id
               FROM context_role_assignments cra
               JOIN contexts actx ON actx.id = cra.context_id
               JOIN target t ON actx.tenant_id = t.tenant_id
               WHERE cra.user_id = ? AND actx.path @> t.path
               UNION
               SELECT mhr.role_id
               FROM model_has_roles mhr
               JOIN target t ON mhr.tenant_id = t.tenant_id
               WHERE mhr.model_id = ?
             )
             SELECT DISTINCT p.name
             FROM granted_roles gr
             JOIN role_has_permissions rhp ON rhp.role_id = gr.role_id
             JOIN permissions p ON p.id = rhp.permission_id",
            [$contextId, $userId, $userId]
        );

        $perms = [];
        foreach ($granted as $row) {
            $perms[$row->name] = true;
        }

        // subtract deny overrides (optional layer)
        $denies = DB::select(
            "WITH target AS (SELECT tenant_id, path FROM contexts WHERE id = ?),
             user_roles AS (
               SELECT DISTINCT cra.role_id
               FROM context_role_assignments cra
               JOIN contexts actx ON actx.id = cra.context_id
               JOIN target t ON actx.tenant_id = t.tenant_id
               WHERE cra.user_id = ? AND actx.path @> t.path
             )
             SELECT po.permission
             FROM permission_overrides po
             JOIN contexts pctx ON pctx.id = po.context_id
             JOIN target t ON pctx.tenant_id = t.tenant_id
             WHERE pctx.path @> t.path
               AND po.effect IN (-1, -1000)
               AND (po.user_id = ? OR po.role_id IN (SELECT role_id FROM user_roles))",
            [$contextId, $userId, $userId]
        );
        foreach ($denies as $row) {
            unset($perms[$row->permission]);
        }

        return array_keys($perms);
    }

    /**
     * Does the user hold $permission at $contextId? Supports wildcard grants:
     * a held "grade.*" satisfies a required "grade.edit"; "*" satisfies anything.
     */
    public function can(string $userId, string $contextId, string $permission): bool
    {
        $perms = array_flip($this->effectivePermissions($userId, $contextId));

        if (isset($perms[$permission]) || isset($perms['*'])) {
            return true;
        }
        if (str_contains($permission, '.')) {
            $wildcard = substr($permission, 0, strpos($permission, '.')).'.*';
            if (isset($perms[$wildcard])) {
                return true;
            }
        }

        return false;
    }

    /** Context id wrapping a given instance (course, module, …), or null. */
    public function contextForInstance(string $level, string $instanceId): ?string
    {
        $row = DB::selectOne(
            'SELECT id FROM contexts WHERE level = ? AND instance_id = ?',
            [$level, $instanceId]
        );

        return $row?->id;
    }

    /** The tenant-root context id, or null. */
    public function tenantContext(string $tenantId): ?string
    {
        $row = DB::selectOne(
            "SELECT id FROM contexts WHERE level = 'tenant' AND instance_id = ?",
            [$tenantId]
        );

        return $row?->id;
    }

    /** List the roles available in a tenant (for assignment UIs). */
    public function listRoles(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () {
            return DB::select(
                'SELECT r.id, r.name,
                        (SELECT string_agg(p.name, \',\' ORDER BY p.name)
                           FROM role_has_permissions rhp JOIN permissions p ON p.id = rhp.permission_id
                          WHERE rhp.role_id = r.id) AS permissions
                   FROM roles r ORDER BY r.name'
            );
        });
    }

    /** Assign a role to a user at a context (tenant-wide, or a specific course). */
    public function assignRole(string $tenantId, string $userId, string $roleName, string $level, ?string $instanceId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $userId, $roleName, $level, $instanceId) {
            $role = DB::selectOne('SELECT id FROM roles WHERE tenant_id = ? AND name = ?', [$tenantId, $roleName]);
            if (! $role) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(404, "Role '$roleName' not found");
            }
            // resolve the context node (tenant-level, or a course)
            $contextId = $level === 'tenant'
                ? $this->tenantContext($tenantId)
                : $this->contextForInstance($level, $instanceId);
            if (! $contextId) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(404, 'Context not found');
            }
            $row = DB::selectOne(
                'INSERT INTO context_role_assignments (tenant_id, role_id, user_id, context_id)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT (tenant_id, user_id, role_id, context_id) DO UPDATE SET role_id = EXCLUDED.role_id
                 RETURNING id, role_id, user_id, context_id',
                [$tenantId, $role->id, $userId, $contextId]
            );

            return (object) ['assignment_id' => $row->id, 'role' => $roleName, 'user_id' => $userId, 'level' => $level];
        });
    }

    /** Remove a role assignment. */
    public function revokeRole(string $tenantId, string $userId, string $roleName, string $level, ?string $instanceId): bool
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $userId, $roleName, $level, $instanceId) {
            $role = DB::selectOne('SELECT id FROM roles WHERE tenant_id = ? AND name = ?', [$tenantId, $roleName]);
            if (! $role) {
                return false;
            }
            $contextId = $level === 'tenant'
                ? $this->tenantContext($tenantId)
                : $this->contextForInstance($level, $instanceId);
            if (! $contextId) {
                return false;
            }
            DB::statement(
                'DELETE FROM context_role_assignments WHERE tenant_id = ? AND role_id = ? AND user_id = ? AND context_id = ?',
                [$tenantId, $role->id, $userId, $contextId]
            );

            return true;
        });
    }

    /** Who has roles where (for an admin people-list). */
    public function listAssignments(string $tenantId, ?string $instanceId = null): array
    {
        return TenantContext::withTenant($tenantId, function () use ($instanceId) {
            $sql = 'SELECT cra.id, cra.user_id, u.email, r.name AS role, ctx.level, ctx.instance_id
                      FROM context_role_assignments cra
                      JOIN users u ON u.id = cra.user_id
                      JOIN roles r ON r.id = cra.role_id
                      JOIN contexts ctx ON ctx.id = cra.context_id';
            $params = [];
            if ($instanceId) {
                $sql .= ' WHERE ctx.instance_id = ?';
                $params[] = $instanceId;
            }
            $sql .= ' ORDER BY u.email, r.name';

            return DB::select($sql, $params);
        });
    }
}
