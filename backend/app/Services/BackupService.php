<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * BackupService — course/tenant backup + export records (spec §5 Phase 5, §10).
 * CONTROL PLANE: backups has RLS OFF. The actual export packaging (course backup
 * format / IMS Common Cartridge) runs in a queue worker that streams to object
 * storage; this owns the backup record + status lifecycle.
 */
class BackupService
{
    /** Request a backup; returns the record in 'pending' (worker fills it). */
    public function request(string $tenantId, array $data): object
    {
        if (empty($data['scope'])) {
            throw new HttpException(400, 'scope is required (course|tenant)');
        }
        if (! in_array($data['scope'], ['course', 'tenant'], true)) {
            throw new HttpException(400, 'scope must be course or tenant');
        }
        if ($data['scope'] === 'course' && empty($data['scopeId'])) {
            throw new HttpException(400, 'scopeId is required for course scope');
        }

        return TenantContext::withSystem(function () use ($tenantId, $data) {
            return DB::selectOne(
                "INSERT INTO backups (tenant_id, scope, scope_id, format, status)
                 VALUES (?, ?, ?, COALESCE(?,'native'), 'pending')
                 RETURNING id, scope, scope_id, format, status, created_at",
                [
                    $tenantId, $data['scope'], $data['scopeId'] ?? null,
                    $data['format'] ?? null,
                ]
            );
        });
    }

    /** Worker callback: mark a backup complete with its storage key + size. */
    public function complete(string $tenantId, string $backupId, string $storageKey, int $sizeBytes): object
    {
        return TenantContext::withSystem(function () use ($backupId, $storageKey, $sizeBytes) {
            $row = DB::selectOne(
                "UPDATE backups SET status='complete', storage_key=?, size_bytes=?
                  WHERE id = ? RETURNING id, status, storage_key, size_bytes",
                [$storageKey, $sizeBytes, $backupId]
            );
            if (! $row) {
                throw new HttpException(404, 'Backup not found');
            }

            return $row;
        });
    }

    public function listForTenant(string $tenantId): array
    {
        return TenantContext::withSystem(function () use ($tenantId) {
            return DB::select(
                'SELECT id, scope, scope_id, format, status, size_bytes, created_at
                   FROM backups WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100',
                [$tenantId]
            );
        });
    }
}
