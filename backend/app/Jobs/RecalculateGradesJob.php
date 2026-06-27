<?php

namespace App\Jobs;

use App\Models\Course;
use App\Models\GradeItem;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\ Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

/**
 * Async grade calculation job.
 * 
 * Triggered when:
 * - A submission is graded
 * - A quiz attempt is finished
 * - An aggregation method changes
 * - A calculated item is edited
 * 
 * Recalculates all grades for affected items and their parents.
 * Runs in background; does not block the request.
 */
class RecalculateGradesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private string $courseId;
    private ?string $gradeItemId;
    private bool $cascade;

    /**
     * @param string $courseId The course to recalculate grades for
     * @param string|null $gradeItemId Specific item, or null to recalculate all
     * @param bool $cascade Cascade to parent items (categories, etc.)
     */
    public function __construct(string $courseId, ?string $gradeItemId = null, bool $cascade = true)
    {
        $this->courseId = $courseId;
        $this->gradeItemId = $gradeItemId;
        $this->cascade = $cascade;
    }

    public function handle(): void
    {
        DB::transaction(function () {
            if ($this->gradeItemId) {
                // Recalculate single item
                $this->recalculateItem($this->gradeItemId);

                // Cascade to parent categories
                if ($this->cascade) {
                    $this->cascadeToParents($this->gradeItemId);
                }
            } else {
                // Recalculate all items in course
                $items = DB::table('grade_items')
                    ->where('course_id', $this->courseId)
                    ->select('id')
                    ->get();

                foreach ($items as $item) {
                    $this->recalculateItem($item->id);
                }
            }
        });
    }

    /**
     * Recalculate grades for a single item.
     */
    private function recalculateItem(string $itemId): void
    {
        $item = DB::table('grade_items')
            ->where('id', $itemId)
            ->first();

        if (!$item) {
            return;
        }

        // If it's a calculated item, recalculate from formula
        if ($item->item_type === 'calculated') {
            $this->recalculateCalculatedItem($itemId, $item);
            return;
        }

        // If it's a category, aggregate child items
        if ($item->item_type === 'category') {
            $this->recalculateCategory($itemId, $item);
            return;
        }
    }

    /**
     * Recalculate a calculated item using its formula.
     */
    private function recalculateCalculatedItem(string $itemId, object $item): void
    {
        $formula = $item->calculation_formula;
        if (!$formula) {
            return;
        }

        // Get all students enrolled in the course
        $students = DB::table('user_enrolments')
            ->where('course_id', $item->course_id)
            ->select('user_id')
            ->distinct()
            ->get();

        foreach ($students as $student) {
            $grade = $this->evaluateFormula($formula, $student->user_id, $item->course_id);

            if ($grade !== null) {
                DB::table('grade_grades')
                    ->updateOrInsert(
                        [
                            'item_id' => $itemId,
                            'user_id' => $student->user_id,
                        ],
                        [
                            'rawgrade' => $grade,
                            'timecreated' => now(),
                            'timemodified' => now(),
                        ]
                    );
            }
        }
    }

    /**
     * Recalculate a category by aggregating child items.
     */
    private function recalculateCategory(string $categoryId, object $category): void
    {
        $aggregationMethod = $category->aggregation_method ?? 'weighted_mean';

        // Get all students
        $students = DB::table('user_enrolments')
            ->where('course_id', $category->course_id)
            ->select('user_id')
            ->distinct()
            ->get();

        foreach ($students as $student) {
            // Get grades for all child items
            $childGrades = DB::table('grade_grades as gg')
                ->join('grade_items as gi', 'gi.id', '=', 'gg.item_id')
                ->where('gi.category_id', $categoryId)
                ->where('gg.user_id', $student->user_id)
                ->where('gg.excluded', 0)
                ->select('gg.rawgrade', 'gi.grademax', 'gi.grademin', 'gi.weight')
                ->get();

            if ($childGrades->isEmpty()) {
                continue;
            }

            $aggregatedGrade = match ($aggregationMethod) {
                'mean' => $this->aggregateMean($childGrades),
                'weighted_mean' => $this->aggregateWeightedMean($childGrades),
                'median' => $this->aggregateMedian($childGrades),
                'mode' => $this->aggregateMode($childGrades),
                'sum' => $this->aggregateSum($childGrades),
                'highest' => $this->aggregateHighest($childGrades),
                'lowest' => $this->aggregateLowest($childGrades),
                default => $this->aggregateMean($childGrades),
            };

            DB::table('grade_grades')
                ->updateOrInsert(
                    [
                        'item_id' => $categoryId,
                        'user_id' => $student->user_id,
                    ],
                    [
                        'rawgrade' => $aggregatedGrade,
                        'timecreated' => now(),
                        'timemodified' => now(),
                    ]
                );
        }
    }

    /**
     * Cascade recalculation to parent categories.
     */
    private function cascadeToParents(string $itemId): void
    {
        $item = DB::table('grade_items')->where('id', $itemId)->first();
        if (!$item || !$item->category_id) {
            return;
        }

        // Recalculate parent category
        $this->recalculateItem($item->category_id);

        // Recursively cascade to grandparent, etc.
        $this->cascadeToParents($item->category_id);
    }

    /**
     * Evaluate a formula for a student.
     * 
     * Formula syntax: [[item1]] + [[item2]] * 0.5
     * Where [[item1]] is replaced with the student's grade for that item.
     */
    private function evaluateFormula(string $formula, string $userId, string $courseId): ?float
    {
        try {
            $expression = $formula;

            // Find all [[item_id]] references
            preg_match_all('/\[\[([a-f0-9-]+)\]\]/', $expression, $matches);

            foreach ($matches[1] as $itemId) {
                // Get the student's grade for this item
                $grade = DB::table('grade_grades')
                    ->where('item_id', $itemId)
                    ->where('user_id', $userId)
                    ->where('excluded', 0)
                    ->value('rawgrade');

                $grade = $grade ?? 0;
                $expression = str_replace("[[{$itemId}]]", (string) $grade, $expression);
            }

            // Safely evaluate the expression
            $result = $this->safeEval($expression);

            return $result;
        } catch (\Exception $e) {
            \Log::error('Formula evaluation error', [
                'formula' => $formula,
                'user_id' => $userId,
                'error' => $e->getMessage(),
            ]);
            return null;
        }
    }

    /**
     * Safely evaluate a mathematical expression.
     * Only allows basic math operators and numbers.
     */
    private function safeEval(string $expression): float
    {
        // Whitelist: digits, operators, parentheses, spaces
        if (!preg_match('/^[0-9+\-*/.()\s]+$/', $expression)) {
            throw new \Exception('Invalid formula expression');
        }

        // Use bc math for precision
        return (float) eval('return ' . $expression . ';');
    }

    private function aggregateMean($grades): float
    {
        return $grades->avg('rawgrade');
    }

    private function aggregateWeightedMean($grades): float
    {
        $totalWeight = $grades->sum('weight');
        if ($totalWeight == 0) {
            return 0;
        }

        $weighted = $grades->sum(fn ($g) => $g->rawgrade * $g->weight);
        return $weighted / $totalWeight;
    }

    private function aggregateMedian($grades): float
    {
        $values = $grades->pluck('rawgrade')->sort()->values()->toArray();
        $count = count($values);
        $middle = (int) ($count / 2);

        if ($count % 2 == 0) {
            return ($values[$middle - 1] + $values[$middle]) / 2;
        }

        return $values[$middle];
    }

    private function aggregateMode($grades): float
    {
        $counts = $grades->pluck('rawgrade')->countBy()->sort()->reverse();
        return $counts->keys()->first();
    }

    private function aggregateSum($grades): float
    {
        return $grades->sum('rawgrade');
    }

    private function aggregateHighest($grades): float
    {
        return $grades->max('rawgrade');
    }

    private function aggregateLowest($grades): float
    {
        return $grades->min('rawgrade');
    }
}
