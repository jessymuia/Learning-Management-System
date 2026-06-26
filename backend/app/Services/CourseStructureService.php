<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CourseStructureService — sections + module placement (spec §2.4).
 * A course is organised into sections (topics/weeks); a course_module places one
 * activity instance (quiz/assignment/content/forum...) into a section.
 */
class CourseStructureService
{
    public function createSection(string $tenantId, string $courseId, array $data): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId, $data) {
            $course = DB::selectOne('SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL', [$courseId]);
            if (! $course) {
                throw new HttpException(404, 'Course not found');
            }
            $next = DB::selectOne(
                'SELECT COALESCE(MAX(section_num),-1) + 1 AS n FROM course_sections WHERE course_id = ?',
                [$courseId]
            );

            return DB::selectOne(
                "INSERT INTO course_sections (tenant_id, course_id, section_num, name, summary, visible, availability)
                 VALUES (?, ?, ?, ?, ?, COALESCE(?,true), ?)
                 RETURNING id, section_num, name, visible",
                [
                    $tenantId, $courseId, $next->n, $data['name'] ?? null,
                    isset($data['summary']) ? json_encode($data['summary']) : null,
                    $data['visible'] ?? null,
                    isset($data['availability']) ? json_encode($data['availability']) : null,
                ]
            );
        });
    }

    public function listSections(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT id, section_num, name, visible FROM course_sections
                  WHERE course_id = ? ORDER BY section_num',
                [$courseId]
            );
        });
    }

    /** Lessons group activities inside a section/unit. */
    public function listLessons(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT id, section_id, title, sort_order, visible FROM lessons
                  WHERE course_id = ? ORDER BY sort_order, created_at',
                [$courseId]
            );
        });
    }

    public function createLesson(string $tenantId, string $courseId, array $data): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId, $data) {
            // section must belong to this course
            $section = DB::selectOne(
                'SELECT id FROM course_sections WHERE id = ? AND course_id = ?',
                [$data['sectionId'], $courseId]
            );
            if (! $section) {
                throw new HttpException(400, 'Section not found for this course');
            }

            return DB::selectOne(
                "INSERT INTO lessons (tenant_id, course_id, section_id, title, summary, sort_order)
                 VALUES (?, ?, ?, ?, ?, COALESCE(?, 0))
                 RETURNING id, section_id, title, sort_order, visible",
                [
                    $tenantId, $courseId, $data['sectionId'], $data['title'],
                    isset($data['summary']) ? json_encode($data['summary']) : null,
                    $data['sortOrder'] ?? null,
                ]
            );
        });
    }

    /** Place an activity instance into a section as a module. */
    public function addModule(string $tenantId, string $courseId, array $data): object
    {
        foreach (['sectionId', 'moduleType', 'instanceId'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId, $data) {
            $section = DB::selectOne('SELECT id FROM course_sections WHERE id = ? AND course_id = ?',
                [$data['sectionId'], $courseId]);
            if (! $section) {
                throw new HttpException(404, 'Section not found in this course');
            }
            $next = DB::selectOne(
                'SELECT COALESCE(MAX(sort_order),-1) + 1 AS n FROM course_modules WHERE section_id = ?',
                [$data['sectionId']]
            );

            return DB::selectOne(
                "INSERT INTO course_modules
                   (tenant_id, course_id, section_id, module_type, instance_id, sort_order, visible, completion)
                 VALUES (?, ?, ?, ?, ?, ?, COALESCE(?,true), ?)
                 RETURNING id, section_id, module_type, instance_id, sort_order, visible",
                [
                    $tenantId, $courseId, $data['sectionId'], $data['moduleType'],
                    $data['instanceId'], $next->n, $data['visible'] ?? null,
                    isset($data['completion']) ? json_encode($data['completion']) : null,
                ]
            );
        });
    }

    public function listModules(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT cm.id, cm.section_id, cs.section_num, cm.module_type, cm.instance_id,
                        cm.sort_order, cm.visible,
                        ca.title AS title
                   FROM course_modules cm
                   JOIN course_sections cs ON cs.id = cm.section_id
                   LEFT JOIN content_activities ca ON ca.id = cm.instance_id
                  WHERE cm.course_id = ? ORDER BY cs.section_num, cm.sort_order',
                [$courseId]
            );
        });
    }

    /** Drag-drop reorder: apply a new ordering of module ids within a section. */
    public function reorderModules(string $tenantId, string $sectionId, array $orderedModuleIds): array
    {
        return TenantContext::withTenant($tenantId, function () use ($sectionId, $orderedModuleIds) {
            $pos = 0;
            foreach ($orderedModuleIds as $moduleId) {
                DB::statement(
                    'UPDATE course_modules SET sort_order = ? WHERE id = ? AND section_id = ?',
                    [$pos++, $moduleId, $sectionId]
                );
            }

            return DB::select(
                'SELECT id, sort_order FROM course_modules WHERE section_id = ? ORDER BY sort_order',
                [$sectionId]
            );
        });
    }

    /** Reorder sections within a course (drag-drop). */
    public function reorderSections(string $tenantId, string $courseId, array $orderedSectionIds): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId, $orderedSectionIds) {
            $pos = 0;
            foreach ($orderedSectionIds as $sectionId) {
                DB::statement(
                    'UPDATE course_sections SET section_num = ? WHERE id = ? AND course_id = ?',
                    [$pos++, $sectionId, $courseId]
                );
            }

            return DB::select(
                'SELECT id, section_num FROM course_sections WHERE course_id = ? ORDER BY section_num',
                [$courseId]
            );
        });
    }

    /** Publish/unpublish a section (toggle visibility to students). */
    public function setSectionVisibility(string $tenantId, string $sectionId, bool $visible): object
    {
        return TenantContext::withTenant($tenantId, function () use ($sectionId, $visible) {
            $row = DB::selectOne(
                'UPDATE course_sections SET visible = ? WHERE id = ? RETURNING id, section_num, name, visible',
                [$visible, $sectionId]
            );
            if (! $row) {
                throw new HttpException(404, 'Section not found');
            }

            return $row;
        });
    }
}
