<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * IntegrationSettingsService — lets a tenant admin manage integration
 * credentials (Stripe, M-Pesa, Mux, SMTP, SSO) through the UI instead of .env.
 *
 * Security model:
 *   - Secrets are WRITE-ONLY over the API: stored, never returned. Listing
 *     returns non-secret config plus a per-field "is set" boolean.
 *   - Secrets are ENCRYPTED AT REST with Laravel Crypt before being written, so
 *     a database leak does not expose live payment keys.
 *   - Only whitelisted providers/fields are accepted (DB CHECK + app whitelist).
 *   - 'enabled' is only changed when the caller explicitly sends it, so editing
 *     one field never silently toggles a live integration off.
 */
class IntegrationSettingsService
{
    private array $secretFields = [
        'stripe' => ['secret_key', 'webhook_secret'],
        'mpesa' => ['consumer_secret', 'passkey', 'callback_secret'],
        'mux' => ['signing_key'],
        'smtp' => ['password'],
        'sso_oidc' => ['client_secret'],
    ];

    private array $publicFields = [
        'stripe' => ['publishable_key'],
        'mpesa' => ['env', 'consumer_key', 'shortcode', 'callback_url', 'allowed_ips'],
        'mux' => ['signing_key_id'],
        'smtp' => ['host', 'port', 'username', 'from_address'],
        'sso_oidc' => ['issuer', 'client_id', 'redirect_uri'],
    ];

    public function providers(): array
    {
        return array_keys($this->secretFields);
    }

    private function assertProvider(string $provider): void
    {
        if (! isset($this->secretFields[$provider])) {
            throw new HttpException(404, 'Unknown integration provider');
        }
    }

    /** List all integrations for a tenant — secrets masked to booleans only. */
    public function list(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId) {
            $rows = DB::select(
                'SELECT provider, config, secrets, enabled, updated_at FROM tenant_integrations WHERE tenant_id = ?',
                [$tenantId]
            );
            $byProvider = [];
            foreach ($rows as $r) {
                $byProvider[$r->provider] = $r;
            }

            $out = [];
            foreach ($this->providers() as $p) {
                $row = $byProvider[$p] ?? null;
                $config = $row ? (json_decode($row->config, true) ?: []) : [];
                $secrets = $row ? (json_decode($row->secrets, true) ?: []) : [];

                $secretStatus = [];
                foreach ($this->secretFields[$p] as $field) {
                    // a field is "set" if a (encrypted) value is present — never decrypt for listing
                    $secretStatus[$field] = ! empty($secrets[$field]);
                }

                $out[] = [
                    'provider' => $p,
                    'enabled' => (bool) ($row->enabled ?? false),
                    'config' => $config,
                    'secrets_set' => $secretStatus,
                    'updated_at' => $row->updated_at ?? null,
                ];
            }

            return $out;
        });
    }

    /**
     * Upsert one provider's settings.
     *  - non-secret fields: replaced when present in input
     *  - secret fields: encrypted and replaced ONLY when a non-empty value is sent
     *    (blank = keep existing secret)
     *  - enabled: changed ONLY when the caller explicitly includes it
     */
    public function save(string $tenantId, string $provider, array $input, ?string $actorUserId = null): array
    {
        $this->assertProvider($provider);

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $provider, $input, $actorUserId) {
            $existing = DB::selectOne(
                'SELECT config, secrets, enabled FROM tenant_integrations WHERE tenant_id = ? AND provider = ?',
                [$tenantId, $provider]
            );
            $config = $existing ? (json_decode($existing->config, true) ?: []) : [];
            $secrets = $existing ? (json_decode($existing->secrets, true) ?: []) : [];

            // merge non-secret config (only keys whitelisted for this provider)
            foreach ($this->publicFields[$provider] as $field) {
                if (array_key_exists($field, $input)) {
                    $config[$field] = is_scalar($input[$field]) ? (string) $input[$field] : $input[$field];
                }
            }

            // merge secrets — encrypt at rest; only overwrite when a non-empty value is provided
            foreach ($this->secretFields[$provider] as $field) {
                if (isset($input[$field]) && $input[$field] !== '') {
                    $secrets[$field] = Crypt::encryptString((string) $input[$field]);
                }
            }

            // enabled: preserve existing unless the caller explicitly sends it.
            if (array_key_exists('enabled', $input)) {
                $enabled = filter_var($input['enabled'], FILTER_VALIDATE_BOOLEAN);
            } else {
                $enabled = $existing ? (bool) $existing->enabled : false;
            }

            DB::statement(
                "INSERT INTO tenant_integrations (tenant_id, provider, config, secrets, enabled, updated_by, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, now())
                 ON CONFLICT (tenant_id, provider)
                 DO UPDATE SET config = EXCLUDED.config, secrets = EXCLUDED.secrets,
                               enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()",
                [$tenantId, $provider, json_encode($config), json_encode($secrets), $enabled, $actorUserId]
            );

            return ['provider' => $provider, 'saved' => true, 'enabled' => $enabled];
        });
    }

    /**
     * Resolve a tenant's live credentials for an engine to USE (decrypted).
     * Returns null when the integration is absent or disabled. This is the read
     * path that makes per-tenant settings actually take effect (falling back to
     * env is the caller's choice). Never expose this over the API.
     */
    public function resolve(string $tenantId, string $provider): ?array
    {
        $this->assertProvider($provider);

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $provider) {
            $row = DB::selectOne(
                'SELECT config, secrets, enabled FROM tenant_integrations WHERE tenant_id = ? AND provider = ?',
                [$tenantId, $provider]
            );
            if (! $row || ! $row->enabled) {
                return null;
            }
            $config = json_decode($row->config, true) ?: [];
            $secretsRaw = json_decode($row->secrets, true) ?: [];

            $secrets = [];
            foreach ($secretsRaw as $k => $v) {
                try {
                    $secrets[$k] = Crypt::decryptString($v);
                } catch (\Throwable $e) {
                    // a value that isn't decryptable is treated as missing, not fatal
                    $secrets[$k] = null;
                }
            }

            return ['config' => $config, 'secrets' => $secrets];
        });
    }
}
