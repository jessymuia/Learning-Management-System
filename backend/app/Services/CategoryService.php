<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CategoryService
{
    public function list(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () {
            return DB::select(
                'SELECT id, parent_id, name, path::text AS path, sort_order, visible
                   FROM course_categories ORDER BY path'
            );
        });
    }

    public function create(string $tenantId, array $data): object
    {
        if (empty($data['name'])) {
            throw new HttpException(400, 'name is required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            $parentId = $data['parentId'] ?? null;
            $sortOrder = $data['sortOrder'] ?? 0;

            if ($parentId) {
                $parent = DB::selectOne('SELECT path::text AS path FROM course_categories WHERE id = ?', [$parentId]);
                if (! $parent) {
                    throw new HttpException(400, 'Parent category not found');
                }
                $ins = DB::selectOne(
                    "INSERT INTO course_categories (tenant_id, parent_id, name, path, sort_order)
                     VALUES (?, ?, ?, (?::text || '.c_tmp')::ltree, ?) RETURNING id",
                    [$tenantId, $parentId, $data['name'], $parent->path, $sortOrder]
                );
                $label = 'c_'.str_replace('-', '_', $ins->id);
                DB::statement(
                    "UPDATE course_categories SET path = (?::text || '.' || ?)::ltree WHERE id = ?",
                    [$parent->path, $label, $ins->id]
                );
            } else {
                $ins = DB::selectOne(
                    "INSERT INTO course_categories (tenant_id, name, path, sort_order)
                     VALUES (?, ?, 'c_tmp', ?) RETURNING id",
                    [$tenantId, $data['name'], $sortOrder]
                );
                $label = 'c_'.str_replace('-', '_', $ins->id);
                DB::statement('UPDATE course_categories SET path = ?::ltree WHERE id = ?', [$label, $ins->id]);
            }

            return DB::selectOne(
                'SELECT id, parent_id, name, path::text AS path, sort_order FROM course_categories WHERE id = ?',
                [$ins->id]
            );
        });
    }
}
