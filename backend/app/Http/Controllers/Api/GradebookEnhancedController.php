<?php

namespace App\Http\Controllers\Api;

use App\Jobs\RecalculateGradesJob;
use App\Services\AvailabilityResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Enhanced gradebook controller with async calculations and conditional availability.
 */
class GradebookEnhancedController extends Controller
{
    /**
     * GET /api/grades/course/{courseId}
     * 
     * Get gradebook for a course with calculated items and category aggregations.
     */
    public function courseGradebook(string $courseId): JsonResponse
    {
        $user = auth('api')->user();
        $tenantId = $user->current_tenant_id;

        // Get all grade items in course hierarchy
        $items = DB::table('grade_items')
            ->where('course_id', $courseId)
            ->where('tenant_id', $tenantId)
            ->orderBy('parent_id')
            ->orderBy('sortorder')
            ->get();

        // Build hierarchy
        $hierarchy = $this->buildItemHierarchy($items, $user->id);

        return response()->json([
            'data' => [
                'courseId' => $courseId,
                'items' => $hierarchy,
            ],
        ]);
    }

    /**
     * POST /api/grades/items/{itemId}/calculate
     * 
     * Manually trigger recalculation for an item.
     * Queues async job.
     */
    public function recalculateItem(string $itemId): JsonResponse
    {
        $user = auth('api')->user();
        $this->authorize('grade.edit');

        $item = DB::table('grade_items')
            ->where('id', $itemId)
            ->first();

        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }

        // Dispatch async job
        RecalculateGradesJob::dispatch($item->course_id, $itemId);

        return response()->json([
            'data' => [
                'message' => 'Grade recalculation queued',
                'itemId' => $itemId,
            ],
        ]);
    }

    /**
     * POST /api/grades/course/{courseId}/calculate
     * 
     * Recalculate all grades in a course.
     */
    public function recalculateCourse(string $courseId): JsonResponse
    {
        $this->authorize('grade.edit');

        RecalculateGradesJob::dispatch($courseId);

        return response()->json([
            'data' => [
                'message' => 'Course grades queued for recalculation',
                'courseId' => $courseId,
            ],
        ]);
    }

    /**
     * POST /api/grades/items
     * 
     * Create a new grade item (standard or calculated).
     */
    public function createItem(Request $request): JsonResponse
    {
        $this->authorize('grade.edit');

        $validated = $request->validate([
            'courseId' => 'required|uuid',
            'itemName' => 'required|string|max:255',
            'itemType' => 'required|in:standard,calculated,category',
            'gradeMax' => 'required|numeric|min:0',
            'gradeMin' => 'numeric|min:0',
            'calculationFormula' => 'required_if:itemType,calculated|string',
            'aggregationMethod' => 'required_if:itemType,category|in:mean,weighted_mean,median,mode,sum,highest,lowest',
            'weight' => 'numeric|min:0',
        ]);

        $item = DB::table('grade_items')->insertGetId([
            'id' => \Illuminate\Support\Str::uuid(),
            'course_id' => $validated['courseId'],
            'itemname' => $validated['itemName'],
            'item_type' => $validated['itemType'],
            'grademax' => $validated['gradeMax'],
            'grademin' => $validated['gradeMin'] ?? 0,
            'calculation_formula' => $validated['calculationFormula'] ?? null,
            'aggregation_method' => $validated['aggregationMethod'] ?? null,
            'weight' => $validated['weight'] ?? 1,
            'timecreated' => now(),
            'timemodified' => now(),
        ]);

        // If calculated, queue initial calculation
        if ($validated['itemType'] === 'calculated') {
            RecalculateGradesJob::dispatch($validated['courseId'], $item);
        }

        return response()->json([
            'data' => ['itemId' => $item, 'message' => 'Grade item created'],
        ], 201);
    }

    /**
     * PUT /api/grades/items/{itemId}
     * 
     * Update a grade item (formula, aggregation method, etc.)
     * Queues recalculation if calculation method changes.
     */
    public function updateItem(Request $request, string $itemId): JsonResponse
    {
        $this->authorize('grade.edit');

        $item = DB::table('grade_items')->where('id', $itemId)->first();
        if (!$item) {
            return response()->json(['error' => 'Item not found'], 404);
        }

        $validated = $request->validate([
            'itemName' => 'string|max:255',
            'calculationFormula' => 'string',
            'aggregationMethod' => 'in:mean,weighted_mean,median,mode,sum,highest,lowest',
            'weight' => 'numeric|min:0',
            'gradeMax' => 'numeric|min:0',
        ]);

        $oldFormula = $item->calculation_formula;

        DB::table('grade_items')
            ->where('id', $itemId)
            ->update([
                'itemname' => $validated['itemName'] ?? $item->itemname,
                'calculation_formula' => $validated['calculationFormula'] ?? $item->calculation_formula,
                'aggregation_method' => $validated['aggregationMethod'] ?? $item->aggregation_method,
                'weight' => $validated['weight'] ?? $item->weight,
                'grademax' => $validated['gradeMax'] ?? $item->grademax,
                'timemodified' => now(),
            ]);

        // Queue recalculation if formula changed
        if (isset($validated['calculationFormula']) && $validated['calculationFormula'] !== $oldFormula) {
            RecalculateGradesJob::dispatch($item->course_id, $itemId);
        }

        return response()->json([
            'data' => ['message' => 'Grade item updated', 'itemId' => $itemId],
        ]);
    }

    /**
     * GET /api/activities/{activityId}/availability
     * 
     * Check if an activity is available to the current user.
     */
    public function checkActivityAvailability(string $activityId): JsonResponse
    {
        $user = auth('api')->user();
        $tenantId = $user->current_tenant_id;

        $availability = AvailabilityResolver::checkAvailability($user->id, $activityId, $tenantId);

        return response()->json(['data' => $availability]);
    }

    /**
     * GET /api/activities/{activityId}/next-available
     * 
     * Get the next available activity in sequence.
     */
    public function getNextAvailable(Request $request, string $activityId): JsonResponse
    {
        $user = auth('api')->user();
        $tenantId = $user->current_tenant_id;

        $courseId = $request->query('courseId');
        if (!$courseId) {
            return response()->json(['error' => 'courseId required'], 400);
        }

        $next = AvailabilityResolver::getNextAvailable(
            $user->id,
            $activityId,
            $courseId,
            $tenantId
        );

        return response()->json([
            'data' => $next ? $next : null,
        ]);
    }

    /**
     * Build grade item hierarchy with user's grades.
     */
    private function buildItemHierarchy($items, string $userId): array
    {
        $hierarchy = [];

        foreach ($items as $item) {
            // Get user's grade for this item
            $grade = DB::table('grade_grades')
                ->where('item_id', $item->id)
                ->where('user_id', $userId)
                ->first();

            $hierarchy[] = [
                'id' => $item->id,
                'name' => $item->itemname,
                'type' => $item->item_type,
                'gradeMax' => $item->grademax,
                'gradeMin' => $item->grademin,
                'userGrade' => $grade?->rawgrade,
                'userFeedback' => $grade?->feedback,
                'aggregationMethod' => $item->aggregation_method,
                'formula' => $item->calculation_formula,
                'weight' => $item->weight,
            ];
        }

        return $hierarchy;
    }
}
