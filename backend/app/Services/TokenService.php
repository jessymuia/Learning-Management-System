<?php

namespace App\Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * TokenService — issues and verifies JWT access + refresh tokens.
 *
 * The access token carries identity AND the active tenant, because the tenant
 * drives RLS on every request. A user in multiple tenants gets a token per
 * active tenant (re-issued when switching tenant context).
 *
 * Uses firebase/php-jwt. If you prefer Laravel Sanctum's database tokens
 * instead of stateless JWT, swap this service for Sanctum's HasApiTokens
 * (the controller surface stays the same).
 */
class TokenService
{
    private string $secret;

    private int $accessTtl;

    private int $refreshTtl;

    public function __construct()
    {
        // Resolve the signing secret with layered fallbacks so a missing
        // JWT_SECRET cannot hard-crash every login with a cryptic error.
        // Order: config('lms.jwt.secret') → JWT_SECRET env → APP_KEY → dev default.
        $secret = config('lms.jwt.secret')
            ?: env('JWT_SECRET')
            ?: env('APP_KEY')
            ?: 'insecure-dev-secret-change-me';

        // APP_KEY often comes as "base64:..."; strip the prefix so the raw
        // key is used consistently for signing and verifying.
        if (is_string($secret) && str_starts_with($secret, 'base64:')) {
            $decoded = base64_decode(substr($secret, 7), true);
            if ($decoded !== false && $decoded !== '') {
                $secret = $decoded;
            }
        }

        $this->secret = (string) $secret;
        $this->accessTtl = (int) config('lms.jwt.access_ttl', 900);          // 15 min
        $this->refreshTtl = (int) config('lms.jwt.refresh_ttl', 2592000);    // 30 days
    }

    public function signAccess(string $userId, string $tenantId, string $email): string
    {
        $now = time();

        return JWT::encode([
            'sub' => $userId,
            'tid' => $tenantId,
            'email' => $email,
            'typ' => 'access',
            'iat' => $now,
            'exp' => $now + $this->accessTtl,
        ], $this->secret, 'HS256');
    }

    public function signRefresh(string $userId, string $tenantId): string
    {
        $now = time();

        return JWT::encode([
            'sub' => $userId,
            'tid' => $tenantId,
            'typ' => 'refresh',
            'iat' => $now,
            'exp' => $now + $this->refreshTtl,
        ], $this->secret, 'HS256');
    }

    /** @return object decoded payload */
    public function verify(string $token): object
    {
        return JWT::decode($token, new Key($this->secret, 'HS256'));
    }
}
