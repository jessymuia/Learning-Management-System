<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ContentService
{
    public function listForCourse(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT id, kind, title, created_at FROM content_activities
                  WHERE course_id = ? ORDER BY created_at',
                [$courseId]
            );
        });
    }

    public function create(string $tenantId, array $data): object
    {
        foreach (['courseId', 'kind', 'title'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            $course = DB::selectOne('SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL', [$data['courseId']]);
            if (! $course) {
                throw new HttpException(404, 'Course not found');
            }

            return DB::selectOne(
                'INSERT INTO content_activities (tenant_id, course_id, kind, title, body)
                 VALUES (?, ?, ?, ?, ?) RETURNING id, kind, title, created_at',
                [$tenantId, $data['courseId'], $data['kind'], $data['title'],
                 isset($data['body']) ? json_encode($data['body']) : null]
            );
        });
    }
}
