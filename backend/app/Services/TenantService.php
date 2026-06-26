<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class TenantService
{
    public function __construct(
        private ?MailService $mail = null,
        private ?TenantBillingService $billing = null
    ) {}

    public function current(string $tenantId): ?object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId) {
            return DB::selectOne(
                'SELECT id, name, slug, status, plan, data_region, settings, created_at
                   FROM tenants WHERE id = ?',
                [$tenantId]
            );
        });
    }

    public function provision(array $data): object
    {
        if (empty($data['name']) || empty($data['slug'])) {
            throw new HttpException(400, 'name and slug are required');
        }

        return TenantContext::withSystem(function () use ($data) {
            try {
                $tenant = DB::selectOne(
                    "INSERT INTO tenants (name, slug, plan, status)
                     VALUES (?, ?, COALESCE(?, 'free'), 'active') RETURNING *",
                    [$data['name'], $data['slug'], $data['plan'] ?? null]
                );
            } catch (\Illuminate\Database\QueryException $e) {
                if ($e->getCode() === '23505') {
                    throw new HttpException(409, 'Tenant slug already taken');
                }
                throw $e;
            }

            // root context node (RBAC hierarchy anchor)
            DB::statement(
                "INSERT INTO contexts (tenant_id, level, instance_id, path, depth)
                 VALUES (?, 'tenant', ?, ('t_' || replace(?::text,'-','_'))::ltree, 0)",
                [$tenant->id, $tenant->id, $tenant->id]
            );

            // seed the 5 standard roles with their permission bundles
            $this->seedRoles($tenant->id);

            // optionally create the first admin (so the tenant is usable immediately)
            $admin = null;
            if (! empty($data['adminEmail'])) {
                $admin = $this->createFirstAdmin($tenant->id, $data['adminEmail'], $data['adminPassword'] ?? null);
                // email the login details to the address used on the form
                $loginUrl = config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:3000')).'/login';
                ($this->mail ?? new MailService())->sendTenantWelcome(
                    $admin->email, $tenant->name, $admin->temp_password, $loginUrl
                );
                $admin->emailed = true;
            }

            // subscribe the new tenant to its plan (records subscription + payment intent)
            $billing = null;
            if (! empty($data['planCode'])) {
                $billing = ($this->billing ?? new TenantBillingService())
                    ->subscribeTenant($tenant->id, $data['planCode'], $data['paymentProvider'] ?? 'manual');
            }

            return (object) [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'status' => $tenant->status,
                'admin' => $admin,
                'billing' => $billing,
            ];
        });
    }

    /** Seed the 5 standard roles + permissions for a tenant. */
    private function seedRoles(string $tenantId): void
    {
        $bundles = [
            'tenant_admin'   => ['course.view','course.manage','enrol.manage','grade.view','grade.edit','quiz.attempt','quiz.manage','program.manage','category.manage','content.upload','payment.verify','payment.view','report.view'],
            'manager'        => ['course.view','course.manage','enrol.manage','grade.view','grade.edit','quiz.attempt','quiz.manage','program.manage','category.manage','content.upload','payment.verify','payment.view','report.view'],
            'course_manager' => ['course.view','course.manage','category.manage','content.upload','quiz.manage','grade.view','report.view'],
            'teacher'        => ['course.view','course.manage','content.upload','grade.view','grade.edit','quiz.attempt','quiz.manage','payment.view'],
            'ta'             => ['course.view','grade.view','grade.edit'],
            'student'        => ['course.view','quiz.attempt'],
            'observer'       => ['course.view','grade.view','report.view','payment.view'],
        ];
        foreach ($bundles as $name => $perms) {
            $role = DB::selectOne(
                'INSERT INTO roles (tenant_id, name) VALUES (?, ?)
                 ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name
                 RETURNING id',
                [$tenantId, $name]
            );
            $placeholders = implode(',', array_fill(0, count($perms), '?'));
            DB::statement(
                "INSERT INTO role_has_permissions (role_id, permission_id)
                 SELECT ?, id FROM permissions WHERE name IN ($placeholders)
                 ON CONFLICT DO NOTHING",
                array_merge([$role->id], $perms)
            );
        }
    }

    /** Create the tenant's first admin: user + membership + login + tenant_admin role. */
    private function createFirstAdmin(string $tenantId, string $email, ?string $password): object
    {
        // if no password given, generate a secure temporary one
        $tempPassword = $password ?: bin2hex(random_bytes(5)); // 10-char temp
        $user = DB::selectOne('SELECT id FROM users WHERE email = ?', [$email]);
        $userId = $user->id ?? DB::selectOne(
            'INSERT INTO users (email, email_verified_at) VALUES (?, now()) RETURNING id', [$email]
        )->id;

        DB::statement(
            "INSERT INTO tenant_memberships (tenant_id, user_id, status) VALUES (?, ?, 'active')
             ON CONFLICT DO NOTHING",
            [$tenantId, $userId]
        );
        DB::statement(
            "INSERT INTO auth_methods (tenant_id, user_id, type, secret_hash) VALUES (?, ?, 'local', ?)
             ON CONFLICT DO NOTHING",
            [$tenantId, $userId, password_hash($tempPassword, PASSWORD_BCRYPT)]
        );
        $role = DB::selectOne("SELECT id FROM roles WHERE tenant_id = ? AND name = 'tenant_admin'", [$tenantId]);
        $ctx = DB::selectOne("SELECT id FROM contexts WHERE level = 'tenant' AND instance_id = ?", [$tenantId]);
        DB::statement(
            "INSERT INTO context_role_assignments (tenant_id, role_id, user_id, context_id)
             VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
            [$tenantId, $role->id, $userId, $ctx->id]
        );

        return (object) [
            'user_id' => $userId,
            'email' => $email,
            'temp_password' => $tempPassword,   // returned so it can be emailed
            'password_was_generated' => ! $password,
        ];
    }

    /** Operator console: list ALL tenants with headline metrics (cross-tenant). */
    public function listAllTenants(): array
    {
        return TenantContext::withSystem(function () {
            return DB::select(
                "SELECT t.id, t.name, t.slug, t.plan, t.status, t.created_at,
                        (SELECT COUNT(*) FROM tenant_memberships tm WHERE tm.tenant_id = t.id) AS members,
                        (SELECT COUNT(*) FROM courses c WHERE c.tenant_id = t.id AND c.deleted_at IS NULL) AS courses
                   FROM tenants t WHERE t.deleted_at IS NULL
                  ORDER BY t.created_at DESC"
            );
        });
    }

    /** Operator console: platform-wide totals. */
    public function platformStats(): object
    {
        return TenantContext::withSystem(function () {
            $base = DB::selectOne(
                "SELECT
                   (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND status='active') AS active_tenants,
                   (SELECT COUNT(*) FROM tenants WHERE deleted_at IS NULL AND status='suspended') AS suspended_tenants,
                   (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS total_users,
                   (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at > now() - interval '30 days') AS new_users_30d,
                   (SELECT COUNT(*) FROM courses WHERE deleted_at IS NULL) AS total_courses,
                   (SELECT COUNT(*) FROM courses WHERE deleted_at IS NULL AND status='active') AS published_courses,
                   (SELECT COUNT(*) FROM programs WHERE status='active') AS total_programs,
                   (SELECT COALESCE(SUM(amount_minor),0) FROM orders WHERE status='paid') AS revenue_minor,
                   (SELECT COUNT(*) FROM orders WHERE status='paid') AS paid_orders,
                   (SELECT COUNT(DISTINCT actor_id) FROM audit_log WHERE action='login' AND created_at > now() - interval '24 hours') AS active_today,
                   (SELECT COUNT(DISTINCT actor_id) FROM audit_log WHERE action='login' AND created_at > now() - interval '7 days') AS active_users_7d,
                   (SELECT COUNT(*) FROM orders WHERE status='pending') AS pending_orders,
                   (SELECT COUNT(*) FROM orders WHERE status='failed') AS failed_orders,
                   (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND created_at > now() - interval '7 days') AS new_users_7d"
            );

            // user counts by role name, platform-wide (roles are per-tenant; we
            // aggregate by name across all tenants via context_role_assignments)
            $roleRows = DB::select(
                "SELECT r.name, COUNT(DISTINCT cra.user_id) AS c
                   FROM context_role_assignments cra
                   JOIN roles r ON r.id = cra.role_id
                   JOIN users u ON u.id = cra.user_id AND u.deleted_at IS NULL
                  GROUP BY r.name"
            );
            $byRole = [];
            foreach ($roleRows as $row) {
                $byRole[$row->name] = (int) $row->c;
            }

            return (object) [
                'active_tenants' => (int) $base->active_tenants,
                'suspended_tenants' => (int) $base->suspended_tenants,
                'total_users' => (int) $base->total_users,
                'new_users_30d' => (int) $base->new_users_30d,
                'total_courses' => (int) $base->total_courses,
                'published_courses' => (int) $base->published_courses,
                'total_programs' => (int) $base->total_programs,
                'revenue_minor' => (int) $base->revenue_minor,
                'paid_orders' => (int) $base->paid_orders,
                'active_today' => (int) $base->active_today,
                'active_users_7d' => (int) $base->active_users_7d,
                'pending_orders' => (int) $base->pending_orders,
                'failed_orders' => (int) $base->failed_orders,
                'new_users_7d' => (int) $base->new_users_7d,
                'students' => $byRole['student'] ?? 0,
                'teachers' => ($byRole['teacher'] ?? 0) + ($byRole['ta'] ?? 0),
                'managers' => ($byRole['manager'] ?? 0) + ($byRole['tenant_admin'] ?? 0),
                'admins' => ($byRole['tenant_admin'] ?? 0),
            ];
        });
    }

    /** Platform-wide time series + activity for the admin dashboard. */
    public function platformAnalytics(): object
    {
        return TenantContext::withSystem(function () {
            // new users per month (last 6 months)
            $userGrowth = DB::select(
                "SELECT to_char(date_trunc('month', created_at), 'Mon') AS label,
                        date_trunc('month', created_at) AS m, COUNT(*) AS value
                   FROM users WHERE deleted_at IS NULL AND created_at > now() - interval '6 months'
                  GROUP BY 1,2 ORDER BY 2"
            );
            // courses created per month
            $courseGrowth = DB::select(
                "SELECT to_char(date_trunc('month', created_at), 'Mon') AS label,
                        date_trunc('month', created_at) AS m, COUNT(*) AS value
                   FROM courses WHERE deleted_at IS NULL AND created_at > now() - interval '6 months'
                  GROUP BY 1,2 ORDER BY 2"
            );
            // revenue per month
            $revenue = DB::select(
                "SELECT to_char(date_trunc('month', created_at), 'Mon') AS label,
                        date_trunc('month', created_at) AS m, COALESCE(SUM(amount_minor),0) AS value
                   FROM orders WHERE status='paid' AND created_at > now() - interval '6 months'
                  GROUP BY 1,2 ORDER BY 2"
            );

            return (object) [
                'user_growth' => $userGrowth,
                'course_growth' => $courseGrowth,
                'revenue' => $revenue,
                'payment_providers' => DB::select(
                    "SELECT provider, status, COUNT(*) AS count, COALESCE(SUM(amount_minor),0) AS total
                       FROM payments GROUP BY provider, status ORDER BY provider, status"
                ),
            ];
        });
    }

    /** Recent platform activity feed + security events from the audit log. */
    public function platformActivity(int $limit = 12): object
    {
        return TenantContext::withSystem(function () use ($limit) {
            $activity = DB::select(
                "SELECT a.action, a.target_type, a.created_at, a.ip,
                        u.email AS actor_email, t.name AS tenant_name
                   FROM audit_log a
                   LEFT JOIN users u ON u.id = a.actor_id
                   LEFT JOIN tenants t ON t.id = a.tenant_id
                  ORDER BY a.created_at DESC LIMIT ?",
                [$limit]
            );
            // security-relevant slice: logins, failures, role/permission changes
            $security = DB::select(
                "SELECT a.action, a.created_at, a.ip, u.email AS actor_email
                   FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
                  WHERE a.action IN ('login','login.failed','role.assign','role.revoke','grade.override','permission.change')
                  ORDER BY a.created_at DESC LIMIT ?",
                [$limit]
            );

            return (object) ['activity' => $activity, 'security' => $security];
        });
    }


    /** Suspend or reactivate a tenant (operator). */
    public function setTenantStatus(string $tenantId, string $status): object
    {
        if (! in_array($status, ['active','suspended'], true)) {
            throw new HttpException(400, 'Invalid status');
        }
        return TenantContext::withSystem(function () use ($tenantId, $status) {
            $row = DB::selectOne(
                'UPDATE tenants SET status = ? WHERE id = ? RETURNING id, name, status',
                [$status, $tenantId]
            );
            if (! $row) { throw new HttpException(404, 'Tenant not found'); }
            return $row;
        });
    }
}
