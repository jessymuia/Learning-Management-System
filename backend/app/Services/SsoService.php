<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * SsoService — pluggable SSO (OIDC / SAML / social) + TOTP MFA (spec §2.2, §13).
 * Decoupled from identity: an auth_method of type oidc|saml|social links an
 * external_id to a user; login verifies the IdP assertion (verification call
 * happens where IdP metadata/keys exist) then issues our JWT. MFA adds a TOTP
 * second factor stored per auth_method.
 */
class SsoService
{
    /** Link or find a user from an external IdP identity, then return user id. */
    public function resolveExternalIdentity(string $tenantId, string $type, string $externalId, string $email): string
    {
        if (! in_array($type, ['oidc', 'saml', 'social', 'ldap'], true)) {
            throw new HttpException(400, 'Unsupported SSO type');
        }

        return TenantContext::withSystem(function () use ($tenantId, $type, $externalId, $email) {
            // existing link?
            $am = DB::selectOne(
                'SELECT user_id FROM auth_methods WHERE tenant_id = ? AND type = ? AND external_id = ?',
                [$tenantId, $type, $externalId]
            );
            if ($am) {
                return $am->user_id;
            }
            // find-or-create the global user by email
            $user = DB::selectOne('SELECT id FROM users WHERE email = ?', [$email]);
            $userId = $user->id ?? DB::selectOne(
                'INSERT INTO users (email) VALUES (?) RETURNING id', [$email]
            )->id;
            // ensure membership
            DB::statement(
                "INSERT INTO tenant_memberships (tenant_id,user_id,status) VALUES (?,?,'active')
                 ON CONFLICT DO NOTHING",
                [$tenantId, $userId]
            );
            // link the external identity
            DB::statement(
                'INSERT INTO auth_methods (tenant_id, user_id, type, external_id) VALUES (?, ?, ?, ?)',
                [$tenantId, $userId, $type, $externalId]
            );

            return $userId;
        });
    }

    /** Enable TOTP MFA for a user's local auth: store the shared secret. */
    public function enableTotp(string $tenantId, string $userId): array
    {
        $secret = $this->base32(random_bytes(20));
        TenantContext::withTenant($tenantId, function () use ($tenantId, $userId, $secret) {
            DB::statement(
                "UPDATE auth_methods SET data = jsonb_set(COALESCE(data,'{}'::jsonb), '{totp_secret}', to_jsonb(?::text))
                  WHERE tenant_id = ? AND user_id = ? AND type = 'local'",
                [$secret, $tenantId, $userId]
            );
        });

        return ['secret' => $secret, 'otpauth' => "otpauth://totp/Atrium?secret={$secret}"];
    }

    /** Verify a 6-digit TOTP code (RFC 6238, 30s window). */
    public function verifyTotp(string $secret, string $code): bool
    {
        $key = $this->base32Decode($secret);
        $time = floor(time() / 30);
        for ($i = -1; $i <= 1; $i++) { // allow ±1 window for clock skew
            if ($this->hotp($key, (int) ($time + $i)) === $code) {
                return true;
            }
        }

        return false;
    }

    private function hotp(string $key, int $counter): string
    {
        $bin = pack('N*', 0).pack('N*', $counter);
        $hash = hash_hmac('sha1', $bin, $key, true);
        $offset = ord($hash[19]) & 0xf;
        $val = ((ord($hash[$offset]) & 0x7f) << 24) | ((ord($hash[$offset + 1]) & 0xff) << 16)
             | ((ord($hash[$offset + 2]) & 0xff) << 8) | (ord($hash[$offset + 3]) & 0xff);

        return str_pad((string) ($val % 1000000), 6, '0', STR_PAD_LEFT);
    }

    private function base32(string $data): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $out = '';
        $bits = 0;
        $value = 0;
        foreach (str_split($data) as $ch) {
            $value = ($value << 8) | ord($ch);
            $bits += 8;
            while ($bits >= 5) {
                $out .= $alphabet[($value >> ($bits - 5)) & 31];
                $bits -= 5;
            }
        }

        return $out;
    }

    private function base32Decode(string $b32): string
    {
        $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $bits = 0;
        $value = 0;
        $out = '';
        foreach (str_split($b32) as $ch) {
            $idx = strpos($alphabet, $ch);
            if ($idx === false) {
                continue;
            }
            $value = ($value << 5) | $idx;
            $bits += 5;
            if ($bits >= 8) {
                $out .= chr(($value >> ($bits - 8)) & 0xff);
                $bits -= 8;
            }
        }

        return $out;
    }
}
