<?php

namespace App\Http\Controllers\Api;

use App\Services\CourseAccessService;
use App\Services\CourseStructureService;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StructureController extends Controller
{
    public function __construct(
        private CourseStructureService $structure,
        private CourseAccessService $access,
    ) {}

    /** Whether the current user can access this course's actual content. */
    private function hasAccess(Request $request, string $courseId): bool
    {
        return $this->access->canAccess(
            $request->attributes->get('tenantId'),
            $courseId,
            $request->attributes->get('userId')
        );
    }

    public function listSections(Request $request, string $courseId): JsonResponse
    {
        $locked = ! $this->hasAccess($request, $courseId);

        return response()->json([
            'data' => $this->structure->listSections(
                $request->attributes->get('tenantId'), $courseId
            ),
            'meta' => ['locked' => $locked],
        ]);
    }

    public function createSection(Request $request, string $courseId): JsonResponse
    {
        $data = $request->validate([
            'name' => 'sometimes|string',
            'summary' => 'sometimes|array',
            'visible' => 'sometimes|boolean',
            'availability' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->structure->createSection(
            $request->attributes->get('tenantId'), $courseId, $data
        )], 201);
    }

    public function listModules(Request $request, string $courseId): JsonResponse
    {
        $tenantId = $request->attributes->get('tenantId');
        $userId   = $request->attributes->get('userId');
        $locked = ! $this->hasAccess($request, $courseId);

        // Unenrolled / unpaid students see the section structure but NOT module
        // details (no titles, types, instance ids) so they cannot cherry-pick
        // content endpoints. Staff always get full data.
        if ($locked) {
            $sections = $this->structure->listSections($tenantId, $courseId);
            $counts = [];
            foreach ($sections as $s) {
                $counts[$s->id] = DB::selectOne(
                    'SELECT COUNT(*) AS c FROM course_modules WHERE section_id = ? AND visible = true',
                    [$s->id]
                )->c ?? 0;
            }

            return response()->json([
                'data' => [],
                'meta' => ['locked' => true, 'section_activity_counts' => $counts],
            ]);
        }

        return response()->json([
            'data' => $this->structure->listModules($tenantId, $courseId),
            'meta' => ['locked' => false],
        ]);
    }

    public function listLessons(Request $request, string $courseId): JsonResponse
    {
        $locked = ! $this->hasAccess($request, $courseId);

        return response()->json([
            'data' => $this->structure->listLessons(
                $request->attributes->get('tenantId'), $courseId
            ),
            'meta' => ['locked' => $locked],
        ]);
    }

    public function createLesson(Request $request, string $courseId): JsonResponse
    {
        $data = $request->validate([
            'sectionId' => 'required|uuid',
            'title' => 'required|string',
            'summary' => 'sometimes|array',
            'sortOrder' => 'sometimes|integer',
        ]);

        return response()->json(['data' => $this->structure->createLesson(
            $request->attributes->get('tenantId'), $courseId, $data
        )], 201);
    }

    public function addModule(Request $request, string $courseId): JsonResponse
    {
        $data = $request->validate([
            'sectionId' => 'required|uuid',
            'moduleType' => 'required|in:assignment,quiz,resource,forum,lti,scorm,content',
            'instanceId' => 'required|uuid',
            'visible' => 'sometimes|boolean',
            'completion' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->structure->addModule(
            $request->attributes->get('tenantId'), $courseId, $data
        )], 201);
    }

    public function setSectionVisibility(Request $request, string $sectionId): JsonResponse
    {
        $data = $request->validate(['visible' => 'required|boolean']);

        return response()->json(['data' => $this->structure->setSectionVisibility(
            $request->attributes->get('tenantId'), $sectionId, $data['visible']
        )]);
    }

    public function reorderModules(Request $request, string $sectionId): JsonResponse
    {
        $data = $request->validate(['order' => 'required|array', 'order.*' => 'uuid']);

        return response()->json(['data' => $this->structure->reorderModules(
            $request->attributes->get('tenantId'), $sectionId, $data['order']
        )]);
    }

    public function reorderSections(Request $request, string $courseId): JsonResponse
    {
        $data = $request->validate(['order' => 'required|array', 'order.*' => 'uuid']);

        return response()->json(['data' => $this->structure->reorderSections(
            $request->attributes->get('tenantId'), $courseId, $data['order']
        )]);
    }
}
