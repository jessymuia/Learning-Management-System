<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * ScormService — SCORM package registry + CMI runtime tracking (spec §8).
 * The JS runtime (wrapped, per spec) calls setTrack/getTracks to persist the
 * CMI data model (cmi.core.lesson_status, cmi.core.score.raw, …).
 */
class ScormService
{
    public function registerPackage(string $tenantId, array $data): object
    {
        foreach (['courseId', 'title'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                'INSERT INTO scorm_packages (tenant_id, course_id, title, version, manifest, package_file_id)
                 VALUES (?, ?, ?, ?, ?, ?)
                 RETURNING id, course_id, title, version',
                [
                    $tenantId, $data['courseId'], $data['title'],
                    $data['version'] ?? '1.2',
                    json_encode($data['manifest'] ?? (object) []),
                    $data['packageFileId'] ?? null,
                ]
            );
        });
    }

    /** Upsert one CMI element (the runtime calls this on every commit). */
    public function setTrack(string $tenantId, string $packageId, string $userId, array $data): object
    {
        foreach (['scoId', 'element', 'value'] as $req) {
            if (! isset($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $packageId, $userId, $data) {
            return DB::selectOne(
                'INSERT INTO scorm_tracks (tenant_id, package_id, user_id, sco_id, element, value, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, now())
                 ON CONFLICT (tenant_id, package_id, user_id, sco_id, element)
                 DO UPDATE SET value = EXCLUDED.value, updated_at = now()
                 RETURNING sco_id, element, value',
                [$tenantId, $packageId, $userId, $data['scoId'], $data['element'], (string) $data['value']]
            );
        });
    }

    public function getTracks(string $tenantId, string $packageId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($packageId, $userId) {
            return DB::select(
                'SELECT sco_id, element, value, updated_at FROM scorm_tracks
                  WHERE package_id = ? AND user_id = ? ORDER BY sco_id, element',
                [$packageId, $userId]
            );
        });
    }
}
