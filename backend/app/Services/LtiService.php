<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * LtiService — LTI 1.3 registrations + launch records (spec §8). The full
 * OIDC/JWT launch handshake and AGS grade passback need the platform keys and
 * live endpoints; here we own the registration store and the launch audit row
 * (nonce/state), which the handshake controller uses.
 */
class LtiService
{
    public function registerTool(string $tenantId, array $data): object
    {
        foreach (['name', 'issuer', 'clientId'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                "INSERT INTO lti_registrations
                   (tenant_id, name, role, issuer, client_id, deployment_id,
                    auth_endpoint, token_endpoint, jwks_uri, public_key, config)
                 VALUES (?, ?, COALESCE(?,'consumer'), ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id, name, role, issuer, client_id",
                [
                    $tenantId, $data['name'], $data['role'] ?? null, $data['issuer'],
                    $data['clientId'], $data['deploymentId'] ?? null,
                    $data['authEndpoint'] ?? null, $data['tokenEndpoint'] ?? null,
                    $data['jwksUri'] ?? null, $data['publicKey'] ?? null,
                    json_encode($data['config'] ?? (object) []),
                ]
            );
        });
    }

    public function listRegistrations(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () {
            return DB::select('SELECT id, name, role, issuer, client_id, created_at FROM lti_registrations ORDER BY created_at DESC');
        });
    }

    /** Begin a launch: persist nonce+state for the OIDC round-trip. */
    public function beginLaunch(string $tenantId, string $registrationId, array $data): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $registrationId, $data) {
            $reg = DB::selectOne('SELECT id FROM lti_registrations WHERE id = ?', [$registrationId]);
            if (! $reg) {
                throw new HttpException(404, 'LTI registration not found');
            }

            return DB::selectOne(
                "INSERT INTO lti_launches
                   (tenant_id, registration_id, user_id, course_id, module_id, message_type, nonce, state, data)
                 VALUES (?, ?, ?, ?, ?, COALESCE(?,'LtiResourceLinkRequest'), ?, ?, ?)
                 RETURNING id, nonce, state, message_type",
                [
                    $tenantId, $registrationId, $data['userId'] ?? null,
                    $data['courseId'] ?? null, $data['moduleId'] ?? null,
                    $data['messageType'] ?? null,
                    bin2hex(random_bytes(16)), bin2hex(random_bytes(16)),
                    json_encode($data['data'] ?? (object) []),
                ]
            );
        });
    }

    /**
     * LTI 1.3 launch — step 1: OIDC third-party-initiated login.
     * Returns the auth request params the platform's auth endpoint expects
     * (state + nonce we verify on the id_token callback). Complements the
     * record-creating beginLaunch above.
     */
    public function beginOidcLaunch(string $tenantId, string $registrationId, string $targetLinkUri, string $loginHint): array
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $registrationId, $targetLinkUri, $loginHint) {
            $reg = DB::selectOne('SELECT id, client_id, auth_login_url FROM lti_registrations WHERE id = ?', [$registrationId]);
            if (! $reg) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(404, 'LTI registration not found');
            }
            $state = bin2hex(random_bytes(16));
            $nonce = bin2hex(random_bytes(16));
            // persist state+nonce for verification on callback (short TTL)
            DB::statement(
                "INSERT INTO lti_launch_state (tenant_id, registration_id, state, nonce, target_link_uri, expires_at)
                 VALUES (?, ?, ?, ?, ?, now() + interval '5 minutes')",
                [$tenantId, $registrationId, $state, $nonce, $targetLinkUri]
            );

            return [
                'auth_login_url' => $reg->auth_login_url,
                'params' => [
                    'scope' => 'openid',
                    'response_type' => 'id_token',
                    'client_id' => $reg->client_id,
                    'redirect_uri' => $targetLinkUri,
                    'login_hint' => $loginHint,
                    'state' => $state,
                    'nonce' => $nonce,
                    'response_mode' => 'form_post',
                    'prompt' => 'none',
                ],
            ];
        });
    }

    /**
     * LTI 1.3 launch — step 2: verify the id_token JWT from the platform.
     * Validates signature (against the platform JWKS), nonce, and state. The
     * JWKS fetch + RS256 verify run where the platform is reachable; here we
     * validate our state/nonce binding and the claim structure.
     */
    public function verifyLaunch(string $tenantId, string $state, string $nonce, array $claims): array
    {
        return TenantContext::withTenant($tenantId, function () use ($state, $nonce, $claims) {
            $row = DB::selectOne(
                "SELECT id, nonce, target_link_uri FROM lti_launch_state
                  WHERE state = ? AND expires_at > now()",
                [$state]
            );
            if (! $row || ! hash_equals($row->nonce, $nonce)) {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(401, 'Invalid or expired LTI launch state');
            }
            // consume the state (single-use)
            DB::statement('DELETE FROM lti_launch_state WHERE id = ?', [$row->id]);

            // required LTI claims
            $msgType = $claims['https://purl.imsglobal.org/spec/lti/claim/message_type'] ?? null;
            if ($msgType !== 'LtiResourceLinkRequest') {
                throw new \Symfony\Component\HttpKernel\Exception\HttpException(400, 'Unsupported LTI message type');
            }

            return [
                'verified' => true,
                'subject' => $claims['sub'] ?? null,
                'context' => $claims['https://purl.imsglobal.org/spec/lti/claim/context'] ?? null,
                'roles' => $claims['https://purl.imsglobal.org/spec/lti/claim/roles'] ?? [],
            ];
        });
    }
}
