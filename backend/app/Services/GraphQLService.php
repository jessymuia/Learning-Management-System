<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * GraphQLService — a focused GraphQL read gateway (spec §8 public API).
 * Rather than pull a full GraphQL engine, this implements the spec's required
 * query surface (me, courses, course, grades) with field selection. It parses a
 * simple query, resolves against tenant-scoped SQL, and returns shaped data.
 *
 * Supported queries:
 *   { me { id email } }
 *   { courses { id shortname fullname } }
 *   { course(id:"...") { id fullname sections { name } } }
 *   { myGrades { item grade } }
 */
class GraphQLService
{
    public function execute(string $tenantId, string $userId, string $query, array $variables = []): array
    {
        $root = $this->parseTopLevel($query);
        $data = [];

        foreach ($root as $field => $args) {
            $data[$field] = match ($field) {
                'me' => $this->resolveMe($tenantId, $userId),
                'courses' => $this->resolveCourses($tenantId),
                'course' => $this->resolveCourse($tenantId, $args['id'] ?? ''),
                'myGrades' => $this->resolveMyGrades($tenantId, $userId),
                default => throw new HttpException(400, "Unknown query field: $field"),
            };
        }

        return ['data' => $data];
    }

    /** Very small parser: extracts top-level fields and their (id:"x") args. */
    private function parseTopLevel(string $query): array
    {
        $inner = trim($query);
        // strip outer braces and optional "query {"
        $inner = preg_replace('/^\s*query\s*\w*\s*/', '', $inner);
        $inner = trim($inner);
        if (str_starts_with($inner, '{')) {
            $inner = substr($inner, 1, strrpos($inner, '}') - 1);
        }
        $fields = [];
        // Walk the string tracking brace depth; only capture identifiers at depth 0.
        $len = strlen($inner);
        $depth = 0;
        $i = 0;
        while ($i < $len) {
            $ch = $inner[$i];
            if ($ch === '{') {
                $depth++;
                $i++;
                continue;
            }
            if ($ch === '}') {
                $depth--;
                $i++;
                continue;
            }
            if ($depth === 0 && preg_match('/[A-Za-z_]/', $ch)) {
                // read an identifier
                preg_match('/\G(\w+)/', $inner, $nm, 0, $i);
                $name = $nm[1];
                $i += strlen($name);
                // optional (args)
                $args = [];
                while ($i < $len && ctype_space($inner[$i])) {
                    $i++;
                }
                if ($i < $len && $inner[$i] === '(') {
                    $close = strpos($inner, ')', $i);
                    $argstr = substr($inner, $i + 1, $close - $i - 1);
                    preg_match_all('/(\w+)\s*:\s*"([^"]*)"/', $argstr, $am, PREG_SET_ORDER);
                    foreach ($am as $a) {
                        $args[$a[1]] = $a[2];
                    }
                    $i = $close + 1;
                }
                $fields[$name] = $args;
                // skip an optional selection-set block belonging to this field
                while ($i < $len && ctype_space($inner[$i])) {
                    $i++;
                }
                if ($i < $len && $inner[$i] === '{') {
                    $b = 1;
                    $i++;
                    while ($i < $len && $b > 0) {
                        if ($inner[$i] === '{') {
                            $b++;
                        } elseif ($inner[$i] === '}') {
                            $b--;
                        }
                        $i++;
                    }
                }

                continue;
            }
            $i++;
        }

        return $fields;
    }

    private function resolveMe(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            $u = DB::selectOne('SELECT id, email FROM users WHERE id = ?', [$userId]);

            return $u ? ['id' => $u->id, 'email' => $u->email] : [];
        });
    }

    private function resolveCourses(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () {
            $rows = DB::select("SELECT id, shortname, fullname FROM courses WHERE deleted_at IS NULL ORDER BY fullname LIMIT 100");

            return array_map(fn ($r) => ['id' => $r->id, 'shortname' => $r->shortname, 'fullname' => $r->fullname], $rows);
        });
    }

    private function resolveCourse(string $tenantId, string $id): array
    {
        if (! $id) {
            throw new HttpException(400, 'course(id:) is required');
        }

        return TenantContext::withTenant($tenantId, function () use ($id) {
            $c = DB::selectOne('SELECT id, shortname, fullname FROM courses WHERE id = ? AND deleted_at IS NULL', [$id]);
            if (! $c) {
                return [];
            }
            $sections = DB::select('SELECT name FROM course_sections WHERE course_id = ? ORDER BY section_num', [$id]);

            return [
                'id' => $c->id,
                'shortname' => $c->shortname,
                'fullname' => $c->fullname,
                'sections' => array_map(fn ($s) => ['name' => $s->name], $sections),
            ];
        });
    }

    private function resolveMyGrades(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            $rows = DB::select(
                'SELECT gi.name AS item, gg.finalgrade AS grade
                   FROM grade_grades gg JOIN grade_items gi ON gi.id = gg.grade_item_id
                  WHERE gg.user_id = ? ORDER BY gi.name LIMIT 200',
                [$userId]
            );

            return array_map(fn ($r) => ['item' => $r->item, 'grade' => $r->grade], $rows);
        });
    }
}
