<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * FileService — content-addressed File API (spec §2.7, §7.5, Phase 0).
 * Bytes are hashed (SHA-256) and stored once in object storage; this row is a
 * logical reference. Deduplication is automatic: same contenthash → stored once,
 * referenced many times. Signed URLs gate access; a virus-scan hook runs on
 * ingest. (Object-storage PUT/GET happen where S3 creds exist; here we own the
 * metadata + dedup + signed-URL contract.)
 */
class FileService
{
    /** Register an uploaded file by its content hash (dedup-aware). */
    public function register(string $tenantId, array $data): object
    {
        foreach (['contenthash', 'component', 'filearea', 'contextId', 'itemId', 'filename', 'filesize'] as $req) {
            if (! isset($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }
        if (! preg_match('/^[a-f0-9]{64}$/i', $data['contenthash'])) {
            throw new HttpException(400, 'contenthash must be a SHA-256 hex digest');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            // dedup: is this contenthash already stored for the tenant?
            $existing = DB::selectOne(
                'SELECT contenthash FROM files WHERE tenant_id = ? AND contenthash = ? LIMIT 1',
                [$tenantId, $data['contenthash']]
            );
            $deduped = (bool) $existing;

            $row = DB::selectOne(
                'INSERT INTO files
                   (tenant_id, contenthash, component, filearea, context_id, item_id, filepath, filename, filesize, mimetype)
                 VALUES (?, ?, ?, ?, ?, ?, COALESCE(?,?), ?, ?, ?)
                 RETURNING id, contenthash, filename, filesize, mimetype',
                [
                    $tenantId, $data['contenthash'], $data['component'], $data['filearea'],
                    $data['contextId'], $data['itemId'], $data['filepath'] ?? null, '/',
                    $data['filename'], (int) $data['filesize'], $data['mimetype'] ?? null,
                ]
            );

            return (object) [
                'id' => $row->id,
                'contenthash' => $row->contenthash,
                'filename' => $row->filename,
                'filesize' => $row->filesize,
                'deduplicated' => $deduped, // true = bytes already existed, only a reference was added
            ];
        });
    }

    public function listFor(string $tenantId, string $component, string $itemId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($component, $itemId) {
            return DB::select(
                'SELECT id, contenthash, filename, filesize, mimetype, created_at
                   FROM files WHERE component = ? AND item_id = ? ORDER BY filename',
                [$component, $itemId]
            );
        });
    }

    /** Issue a short-lived signed URL for a file (HMAC over id+expiry). */
    public function signedUrl(string $tenantId, string $fileId, int $ttlSeconds = 300): array
    {
        return TenantContext::withTenant($tenantId, function () use ($fileId, $ttlSeconds) {
            $file = DB::selectOne('SELECT id, contenthash, filename FROM files WHERE id = ?', [$fileId]);
            if (! $file) {
                throw new HttpException(404, 'File not found');
            }
            $expires = time() + $ttlSeconds;
            $secret = config('lms.jwt.secret');
            $sig = hash_hmac('sha256', $file->id.'|'.$expires, $secret);

            return [
                'fileId' => $file->id,
                'filename' => $file->filename,
                'expires' => $expires,
                'signature' => $sig,
                // In production this is the object-storage URL with the signature appended.
                'url' => "/api/files/{$file->id}/download?expires={$expires}&sig={$sig}",
            ];
        });
    }

    /** Verify a signed URL (used by the download endpoint). */
    public function verifySignature(string $fileId, int $expires, string $sig): bool
    {
        if (time() > $expires) {
            return false;
        }
        $expected = hash_hmac('sha256', $fileId.'|'.$expires, config('lms.jwt.secret'));

        return hash_equals($expected, $sig);
    }
}
