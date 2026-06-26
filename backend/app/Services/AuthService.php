<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * AuthService — implements the spec's identity model:
 *   - users are GLOBAL (one row per human, keyed by email)
 *   - tenant_memberships ties a user to a tenant
 *   - auth_methods holds the per-tenant local credential (bcrypt/argon2id hash)
 *
 * Registration and login look across tenants by email, so identity lookups run
 * under withSystem() (RLS bypass) — the one legitimate place to bypass RLS:
 * global identity resolution before a tenant context exists.
 */
class AuthService
{
    public function __construct(private TokenService $tokens) {}

    public function register(string $tenantSlug, string $email, string $password, array $profile = []): array
    {
        if (strlen($password) < 8) {
            throw ValidationException::withMessages(['password' => 'Password must be at least 8 characters']);
        }

        return TenantContext::withSystem(function () use ($tenantSlug, $email, $password, $profile) {
            $tenant = DB::selectOne(
                "SELECT id FROM tenants WHERE slug = ? AND status = 'active'",
                [$tenantSlug]
            );
            if (! $tenant) {
                throw new HttpException(404, 'Tenant not found');
            }
            $tenantId = $tenant->id;

            // upsert global user by email
            $user = DB::selectOne('SELECT id FROM users WHERE email = ?', [$email]);
            if ($user) {
                $userId = $user->id;
            } else {
                $row = DB::selectOne(
                    'INSERT INTO users (email, profile) VALUES (?, ?) RETURNING id',
                    [$email, json_encode($profile ?: (object) [])]
                );
                $userId = $row->id;
            }

            // membership (idempotent)
            DB::statement(
                "INSERT INTO tenant_memberships (tenant_id, user_id, status)
                 VALUES (?, ?, 'active')
                 ON CONFLICT (tenant_id, user_id) DO NOTHING",
                [$tenantId, $userId]
            );

            // local credential — unique (one local per tenant/user)
            $hash = Hash::make($password);
            try {
                DB::statement(
                    "INSERT INTO auth_methods (tenant_id, user_id, type, secret_hash)
                     VALUES (?, ?, 'local', ?)",
                    [$tenantId, $userId, $hash]
                );
            } catch (\Illuminate\Database\QueryException $e) {
                if ($e->getCode() === '23505') {
                    throw new HttpException(409, 'Account already exists for this tenant');
                }
                throw $e;
            }

            return $this->issueTokens($userId, $tenantId, $email);
        });
    }

    public function login(string $tenantSlug, string $email, string $password): array
    {
        return TenantContext::withSystem(function () use ($tenantSlug, $email, $password) {
            $row = DB::selectOne(
                "SELECT u.id AS user_id, t.id AS tenant_id, am.secret_hash
                   FROM tenants t
                   JOIN users u ON u.email = ?
                   JOIN tenant_memberships tm ON tm.tenant_id = t.id AND tm.user_id = u.id
                   LEFT JOIN auth_methods am
                          ON am.tenant_id = t.id AND am.user_id = u.id AND am.type = 'local'
                  WHERE t.slug = ?
                    AND t.status = 'active'
                    AND tm.status = 'active'
                    AND u.status = 'active'",
                [$email, $tenantSlug]
            );

            if (! $row || ! $row->secret_hash || ! Hash::check($password, $row->secret_hash)) {
                throw new HttpException(401, 'Invalid credentials');
            }

            DB::statement('UPDATE users SET last_login_at = now() WHERE id = ?', [$row->user_id]);

            return $this->issueTokens($row->user_id, $row->tenant_id, $email);
        });
    }

    /**
     * Operator (super-admin) login — no organization needed. Authenticates by
     * email + password and only succeeds if the user is a platform operator.
     * Resolves the operator's home tenant automatically (any active membership).
     */
    public function operatorLogin(string $email, string $password): array
    {
        return TenantContext::withSystem(function () use ($email, $password) {
            $row = DB::selectOne(
                "SELECT u.id AS user_id, tm.tenant_id, am.secret_hash, po.level
                   FROM users u
                   JOIN platform_operators po ON po.user_id = u.id
                   JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.status = 'active'
                   LEFT JOIN auth_methods am
                          ON am.user_id = u.id AND am.tenant_id = tm.tenant_id AND am.type = 'local'
                  WHERE u.email = ? AND u.status = 'active'
                  ORDER BY tm.joined_at
                  LIMIT 1",
                [$email]
            );

            if (! $row || ! $row->secret_hash || ! Hash::check($password, $row->secret_hash)) {
                // same error whether not-an-operator or bad password (no enumeration)
                throw new HttpException(401, 'Invalid operator credentials');
            }

            DB::statement('UPDATE users SET last_login_at = now() WHERE id = ?', [$row->user_id]);

            $tokens = $this->issueTokens($row->user_id, $row->tenant_id, $email);
            $tokens['operator_level'] = $row->level;

            return $tokens;
        });
    }

    public function refresh(string $refreshToken): array
    {
        try {
            $payload = $this->tokens->verify($refreshToken);
        } catch (\Throwable $e) {
            throw new HttpException(401, 'Invalid refresh token');
        }
        if (($payload->typ ?? null) !== 'refresh') {
            throw new HttpException(401, 'Wrong token type');
        }

        return [
            'accessToken' => $this->tokens->signAccess($payload->sub, $payload->tid, $payload->email ?? ''),
            'tokenType' => 'Bearer',
        ];
    }

    private function issueTokens(string $userId, string $tenantId, string $email): array
    {
        return [
            'user' => ['id' => $userId, 'email' => $email, 'tenantId' => $tenantId],
            'accessToken' => $this->tokens->signAccess($userId, $tenantId, $email),
            'refreshToken' => $this->tokens->signRefresh($userId, $tenantId),
            'tokenType' => 'Bearer',
        ];
    }

    /**
     * Begin a password reset. Resolves the user by org slug + email, creates a
     * single-use token (stored hashed), and returns the RAW token so the caller
     * can email it. Always succeeds silently if the user doesn't exist (no
     * account enumeration). In production the token is emailed, not returned.
     */
    public function requestPasswordReset(string $tenantSlug, string $email): ?string
    {
        return TenantContext::withSystem(function () use ($tenantSlug, $email) {
            $row = DB::selectOne(
                "SELECT u.id AS user_id, t.id AS tenant_id
                   FROM users u
                   JOIN tenant_memberships tm ON tm.user_id = u.id
                   JOIN tenants t ON t.id = tm.tenant_id
                  WHERE t.slug = ? AND u.email = ?",
                [$tenantSlug, $email]
            );
            if (! $row) {
                return null; // silent: don't reveal whether the account exists
            }

            $raw = bin2hex(random_bytes(32));
            $hash = hash('sha256', $raw);
            DB::statement(
                "INSERT INTO password_resets (tenant_id, user_id, token_hash, expires_at)
                 VALUES (?, ?, ?, now() + interval '1 hour')",
                [$row->tenant_id, $row->user_id, $hash]
            );

            return $raw;
        });
    }

    /** Complete a reset: validate the token, set the new password, mark token used. */
    public function resetPassword(string $rawToken, string $newPassword): bool
    {
        return TenantContext::withSystem(function () use ($rawToken, $newPassword) {
            $hash = hash('sha256', $rawToken);
            $pr = DB::selectOne(
                "SELECT id, tenant_id, user_id FROM password_resets
                  WHERE token_hash = ? AND used_at IS NULL AND expires_at > now()
                  LIMIT 1",
                [$hash]
            );
            if (! $pr) {
                return false;
            }

            $newHash = Hash::make($newPassword);
            DB::statement(
                "UPDATE auth_methods SET secret_hash = ?
                  WHERE user_id = ? AND tenant_id = ? AND type = 'local'",
                [$newHash, $pr->user_id, $pr->tenant_id]
            );
            DB::statement("UPDATE password_resets SET used_at = now() WHERE id = ?", [$pr->id]);

            return true;
        });
    }
}
