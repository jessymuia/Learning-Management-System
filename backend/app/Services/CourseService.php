<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CourseService — course CRUD. Creating a course also creates, in one
 * transaction:
 *   - its context node (so RBAC can scope roles to the course), parented under
 *     the category context (or tenant context), and
 *   - the course-total grade item (every course has exactly one).
 */
class CourseService
{
    public function list(string $tenantId, array $filters): array
    {
        return TenantContext::withTenant($tenantId, function () use ($filters) {
            $where = ['deleted_at IS NULL'];
            $params = [];
            if (! empty($filters['status'])) {
                $where[] = 'status = ?';
                $params[] = $filters['status'];
            }
            if (! empty($filters['categoryId'])) {
                $where[] = 'category_id = ?';
                $params[] = $filters['categoryId'];
            }
            $limit = min((int) ($filters['limit'] ?? 50), 100);
            $offset = (int) ($filters['offset'] ?? 0);
            $params[] = $limit;
            $params[] = $offset;

            return DB::select(
                'SELECT c.id, c.category_id, c.shortname, c.fullname, c.format, c.status, c.visible,
                        c.start_date, c.end_date, c.created_at,
                        c.is_paid, c.price_minor, c.currency,
                        cat.name AS category_name,
                        (SELECT COUNT(*) FROM user_enrolments ue
                          WHERE ue.course_id = c.id AND ue.status = \'active\') AS enrolled_count
                   FROM courses c
                   LEFT JOIN course_categories cat ON cat.id = c.category_id
                  WHERE '.implode(' AND ', array_map(fn ($w) => str_starts_with($w, 'deleted_at') || str_starts_with($w, 'status') || str_starts_with($w, 'category_id') ? 'c.'.$w : $w, $where)).'
                  ORDER BY c.created_at DESC
                  LIMIT ? OFFSET ?',
                $params
            );
        });
    }

    public function getById(string $tenantId, string $id): ?object
    {
        return TenantContext::withTenant($tenantId, function () use ($id) {
            return DB::selectOne(
                'SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL',
                [$id]
            );
        });
    }

    public function create(string $tenantId, array $data): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            $cat = DB::selectOne(
                'SELECT id, path::text AS path FROM course_categories WHERE id = ?',
                [$data['categoryId']]
            );
            if (! $cat) {
                throw new HttpException(400, 'Category not found');
            }

            $course = DB::selectOne(
                "INSERT INTO courses (tenant_id, category_id, shortname, fullname, format, status, summary,
                                      is_paid, price_minor, currency)
                 VALUES (?, ?, ?, ?, COALESCE(?, 'topics'), COALESCE(?, 'draft'), ?,
                         COALESCE(?, false), COALESCE(?, 0), COALESCE(?, 'KES'))
                 RETURNING *",
                [
                    $tenantId, $data['categoryId'], $data['shortname'], $data['fullname'],
                    $data['format'] ?? null, $data['status'] ?? null,
                    isset($data['summary']) ? json_encode($data['summary']) : null,
                    $data['isPaid'] ?? null,
                    isset($data['priceMinor']) ? (int) $data['priceMinor'] : null,
                    $data['currency'] ?? null,
                ]
            );

            // parent context: category context, else tenant context (created if absent)
            $parent = DB::selectOne(
                "SELECT id, path::text AS path FROM contexts WHERE level='category' AND instance_id=?",
                [$data['categoryId']]
            );
            if (! $parent) {
                $parent = DB::selectOne(
                    "SELECT id, path::text AS path FROM contexts WHERE level='tenant' AND instance_id=?",
                    [$tenantId]
                );
            }
            if (! $parent) {
                $parent = DB::selectOne(
                    "INSERT INTO contexts (tenant_id, level, instance_id, path, depth)
                     VALUES (?, 'tenant', ?, ('t_' || replace(?::text,'-','_'))::ltree, 0)
                     RETURNING id, path::text AS path",
                    [$tenantId, $tenantId, $tenantId]
                );
            }

            $label = 'crs_'.str_replace('-', '_', $course->id);
            DB::statement(
                "INSERT INTO contexts (tenant_id, level, instance_id, parent_id, path, depth)
                 VALUES (?, 'course', ?, ?, (?::text || '.' || ?)::ltree,
                         nlevel((?::text || '.' || ?)::ltree) - 1)",
                [$tenantId, $course->id, $parent->id, $parent->path, $label, $parent->path, $label]
            );

            // course-total grade item (one per course)
            DB::statement(
                "INSERT INTO grade_items (tenant_id, course_id, item_type, name, grademax)
                 VALUES (?, ?, 'course', 'Course total', 100)",
                [$tenantId, $course->id]
            );

            return $course;
        });
    }

    public function update(string $tenantId, string $id, array $data): object
    {
        $allowed = ['shortname', 'fullname', 'format', 'status', 'visible', 'start_date', 'end_date', 'is_paid', 'price_minor', 'currency'];
        $sets = [];
        $params = [];
        foreach ($allowed as $key) {
            if (array_key_exists($key, $data)) {
                $sets[] = "$key = ?";
                $params[] = $data[$key];
            }
        }
        if (array_key_exists('summary', $data)) {
            $sets[] = 'summary = ?';
            $params[] = json_encode($data['summary']);
        }
        if (empty($sets)) {
            throw new HttpException(400, 'No updatable fields provided');
        }
        $params[] = $id;

        return TenantContext::withTenant($tenantId, function () use ($sets, $params) {
            $row = DB::selectOne(
                'UPDATE courses SET '.implode(', ', $sets).'
                  WHERE id = ? AND deleted_at IS NULL RETURNING *',
                $params
            );
            if (! $row) {
                throw new HttpException(404, 'Course not found');
            }

            return $row;
        });
    }

    public function softDelete(string $tenantId, string $id): array
    {
        return TenantContext::withTenant($tenantId, function () use ($id) {
            $row = DB::selectOne(
                "UPDATE courses SET deleted_at = now(), status = 'deleted'
                  WHERE id = ? AND deleted_at IS NULL RETURNING id",
                [$id]
            );
            if (! $row) {
                throw new HttpException(404, 'Course not found');
            }

            return ['id' => $id, 'deleted' => true];
        });
    }
}
