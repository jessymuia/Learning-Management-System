<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CredentialService — badge/certificate definitions + issuance + public
 * verification (spec §2.8, §7.5, Phase 3). Programs auto-issue via
 * ProgramService; this adds explicit course credentials and the verify endpoint.
 */
class CredentialService
{
    public function defineCredential(string $tenantId, array $data): object
    {
        foreach (['type', 'name', 'sourceType'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                "INSERT INTO credential_definitions
                   (tenant_id, type, name, source_type, source_id, template, criteria, active)
                 VALUES (?, ?, ?, ?, ?, COALESCE(?,'{}'::jsonb), COALESCE(?,'{}'::jsonb), true)
                 RETURNING id, type, name, source_type, source_id",
                [
                    $tenantId, $data['type'], $data['name'], $data['sourceType'],
                    $data['sourceId'] ?? null,
                    isset($data['template']) ? json_encode($data['template']) : null,
                    isset($data['criteria']) ? json_encode($data['criteria']) : null,
                ]
            );
        });
    }

    /** Issue a credential to a user (idempotent per definition+user). */
    public function issue(string $tenantId, string $definitionId, string $userId, array $evidence = []): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $definitionId, $userId, $evidence) {
            $def = DB::selectOne('SELECT id FROM credential_definitions WHERE id = ? AND active = true', [$definitionId]);
            if (! $def) {
                throw new HttpException(404, 'Credential definition not found');
            }
            $code = strtoupper(bin2hex(random_bytes(8)));

            return DB::selectOne(
                "INSERT INTO user_credentials (tenant_id, definition_id, user_id, verification_code, evidence)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (tenant_id, definition_id, user_id) DO UPDATE SET evidence = EXCLUDED.evidence
                 RETURNING id, definition_id, user_id, verification_code, issued_at",
                [$tenantId, $definitionId, $userId, $code, json_encode($evidence)]
            );
        });
    }

    public function listForUser(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            return DB::select(
                'SELECT uc.id, uc.verification_code, uc.issued_at, cd.type, cd.name
                   FROM user_credentials uc JOIN credential_definitions cd ON cd.id = uc.definition_id
                  WHERE uc.user_id = ? AND uc.revoked_at IS NULL ORDER BY uc.issued_at DESC',
                [$userId]
            );
        });
    }

    /** Public verification by code — no tenant scoping (cross-tenant verify). */
    public function verify(string $code): ?object
    {
        return TenantContext::withSystem(function () use ($code) {
            return DB::selectOne(
                "SELECT uc.verification_code, uc.issued_at, uc.revoked_at,
                        cd.type, cd.name, u.email AS holder,
                        COALESCE(t.settings->'branding'->>'displayName', t.name) AS org_name,
                        COALESCE(t.settings->'branding'->>'primaryColor', '#4f46e5') AS org_color
                   FROM user_credentials uc
                   JOIN credential_definitions cd ON cd.id = uc.definition_id
                   JOIN users u ON u.id = uc.user_id
                   JOIN tenants t ON t.id = uc.tenant_id
                  WHERE uc.verification_code = ?",
                [$code]
            );
        });
    }
}
