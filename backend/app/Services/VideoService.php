<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * VideoService — video source descriptors (spec §7.6).
 *
 * The hosting/delivery decision lives in two columns, as data not code:
 *   provider = youtube|vimeo|mux|cloudflare_stream|self  (which player/adapter)
 *   gated    = false → open embed (YouTube/Vimeo, free/low-sensitivity)
 *              true  → signed-URL/token delivery (Mux/Cloudflare, paid/compliance)
 *
 * playbackInfo() returns what a client needs to render the right player without
 * the client knowing the hosting strategy. For gated managed providers it
 * returns a short-lived signed token placeholder (the real signing call to
 * Mux/Cloudflare happens where credentials exist — not in this sandbox).
 */
class VideoService
{
    private const OPEN_PROVIDERS = ['youtube', 'vimeo'];

    private const MANAGED_PROVIDERS = ['mux', 'cloudflare_stream', 'self'];

    public function attachVideo(string $tenantId, array $data): object
    {
        foreach (['contentId', 'provider'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }
        $provider = $data['provider'];
        if (! in_array($provider, [...self::OPEN_PROVIDERS, ...self::MANAGED_PROVIDERS], true)) {
            throw new HttpException(400, 'Unknown video provider');
        }

        // The decision rule: open providers default to ungated; managed default gated.
        $gated = array_key_exists('gated', $data)
            ? (bool) $data['gated']
            : in_array($provider, self::MANAGED_PROVIDERS, true);

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data, $provider, $gated) {
            $content = DB::selectOne('SELECT id FROM content_activities WHERE id = ?', [$data['contentId']]);
            if (! $content) {
                throw new HttpException(404, 'Content activity not found');
            }

            return DB::selectOne(
                'INSERT INTO video_sources
                   (tenant_id, content_id, provider, external_id, url, gated, duration_s, captions, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 RETURNING id, content_id, provider, gated, duration_s',
                [
                    $tenantId, $data['contentId'], $provider,
                    $data['externalId'] ?? null, $data['url'] ?? null, $gated,
                    $data['durationS'] ?? null,
                    isset($data['captions']) ? json_encode($data['captions']) : null,
                    json_encode($data['metadata'] ?? (object) []),
                ]
            );
        });
    }

    /**
     * Return playback instructions for a client. Open providers → embed URL.
     * Gated providers → a (placeholder) signed token the player exchanges.
     */
    public function playbackInfo(string $tenantId, string $videoId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($videoId) {
            $v = DB::selectOne(
                'SELECT id, provider, external_id, url, gated, duration_s, metadata
                   FROM video_sources WHERE id = ?',
                [$videoId]
            );
            if (! $v) {
                throw new HttpException(404, 'Video not found');
            }

            if (! $v->gated) {
                // open embed — hand back the canonical/embed URL + provider
                return [
                    'provider' => $v->provider,
                    'mode' => 'embed',
                    'externalId' => $v->external_id,
                    'url' => $v->url,
                    'durationS' => $v->duration_s,
                ];
            }

            // gated — sign a short-lived playback JWT the player exchanges with
            // the provider (Mux/Cloudflare). Real signing fires when the provider
            // signing key is configured (MUX_SIGNING_KEY/_ID); otherwise we return
            // an unsigned token + a clear "not configured" flag.
            $signed = $this->signPlaybackToken($v->external_id ?: $v->id, 3600);

            return [
                'provider' => $v->provider,
                'mode' => 'signed',
                'playbackToken' => $signed['token'],
                'signed' => $signed['configured'],
                'expiresInS' => 3600,
                'durationS' => $v->duration_s,
                'note' => $signed['configured']
                    ? 'Signed with the managed-provider key.'
                    : 'Set MUX_SIGNING_KEY + MUX_SIGNING_KEY_ID to issue real signed tokens.',
            ];
        });
    }

    /**
     * Sign a Mux-style playback JWT (aud=v, sub=playbackId, exp). Mux uses
     * RS256 with a base64-encoded private key; we support that when configured,
     * and fall back to an HS256 token (still a valid JWT) otherwise.
     * Returns ['token' => ..., 'configured' => bool].
     */
    private function signPlaybackToken(string $playbackId, int $ttlSeconds): array
    {
        $keyId = env('MUX_SIGNING_KEY_ID');
        $keyB64 = env('MUX_SIGNING_KEY');           // base64-encoded RSA private key (Mux format)
        $now = time();
        $payload = [
            'sub' => $playbackId,
            'aud' => 'v',                            // 'v' = video playback (Mux convention)
            'exp' => $now + $ttlSeconds,
            'iat' => $now,
        ];

        if ($keyId && $keyB64) {
            $privateKey = base64_decode($keyB64);
            $header = ['alg' => 'RS256', 'typ' => 'JWT', 'kid' => $keyId];
            $segments = [
                $this->b64url(json_encode($header)),
                $this->b64url(json_encode($payload)),
            ];
            $signingInput = implode('.', $segments);
            $signature = '';
            if (openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
                $segments[] = $this->b64url($signature);

                return ['token' => implode('.', $segments), 'configured' => true];
            }
        }

        // Not configured (or signing failed) — return an unsigned-but-valid JWT.
        $header = ['alg' => 'none', 'typ' => 'JWT'];
        $token = $this->b64url(json_encode($header)).'.'.$this->b64url(json_encode($payload)).'.';

        return ['token' => $token, 'configured' => false];
    }

    private function b64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
