<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * GradebookService — grade items, categories, grades, aggregation, summary.
 *
 * The aggregation rules are the spec's nastiest edge cases and are implemented
 * to match the SQL oracle validated against the live database:
 *   - NULL rawgrade means "not graded" and is SKIPPED (never treated as 0)
 *   - excluded grades are removed from aggregation (but remain visible)
 *   - 'natural' = sum of finalgrades
 *   - 'mean' with drop_lowest = drop N lowest, then average
 *
 * Recomputation writes a denormalized gradebook_summary row for fast reads.
 * (In production this runs in a queued job; here it is a synchronous method so
 * the semantics are pinned and callable from a controller or worker.)
 */
class GradebookService
{
    // ── Grade categories ────────────────────────────────────────────────────
    public function createCategory(string $tenantId, array $data): object
    {
        if (empty($data['courseId'])) {
            throw new HttpException(400, 'courseId is required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            $parentPath = 'g';
            if (! empty($data['parentId'])) {
                $p = DB::selectOne('SELECT path::text AS path FROM grade_categories WHERE id = ?', [$data['parentId']]);
                if (! $p) {
                    throw new HttpException(400, 'Parent grade category not found');
                }
                $parentPath = $p->path;
            }

            $ins = DB::selectOne(
                "INSERT INTO grade_categories (tenant_id, course_id, parent_id, path, name, aggregation, drop_lowest, keep_highest)
                 VALUES (?, ?, ?, 'g_tmp', ?, COALESCE(?, 'natural'), COALESCE(?, 0), COALESCE(?, 0))
                 RETURNING id",
                [
                    $tenantId, $data['courseId'], $data['parentId'] ?? null,
                    $data['name'] ?? null, $data['aggregation'] ?? null,
                    $data['dropLowest'] ?? null, $data['keepHighest'] ?? null,
                ]
            );
            $label = 'g_'.str_replace('-', '_', $ins->id);
            $path = ($parentPath === 'g') ? $label : $parentPath.'.'.$label;
            DB::statement('UPDATE grade_categories SET path = ?::ltree WHERE id = ?', [$path, $ins->id]);

            return DB::selectOne(
                'SELECT id, course_id, parent_id, path::text AS path, name, aggregation, drop_lowest, keep_highest
                   FROM grade_categories WHERE id = ?',
                [$ins->id]
            );
        });
    }

    // ── Grade items ─────────────────────────────────────────────────────────
    public function createItem(string $tenantId, array $data): object
    {
        foreach (['courseId', 'itemType'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                "INSERT INTO grade_items
                   (tenant_id, course_id, category_id, item_type, module_id, name,
                    grademin, grademax, gradepass, weight, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, COALESCE(?,0), COALESCE(?,100), ?, ?, COALESCE(?,0))
                 RETURNING id, course_id, category_id, item_type, name, grademin, grademax, weight",
                [
                    $tenantId, $data['courseId'], $data['categoryId'] ?? null,
                    $data['itemType'], $data['moduleId'] ?? null, $data['name'] ?? null,
                    $data['grademin'] ?? null, $data['grademax'] ?? null,
                    $data['gradepass'] ?? null, $data['weight'] ?? null, $data['sortOrder'] ?? null,
                ]
            );
        });
    }

    public function listItems(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT id, category_id, item_type, name, grademin, grademax, gradepass, weight, sort_order
                   FROM grade_items WHERE course_id = ? ORDER BY sort_order, name',
                [$courseId]
            );
        });
    }

    // ── Activity → gradebook bridge ─────────────────────────────────────────
    // Find (or lazily create) the grade_item for an assignment/quiz module, so
    // auto-graded quizzes and manually-graded assignments land in grade_grades
    // — the spec's rule that "auto and manual grades share the same rows."
    public function ensureModuleGradeItem(string $tenantId, string $courseId, string $moduleType, string $instanceId, string $name, float $gradeMax): string
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId, $moduleType, $instanceId, $name, $gradeMax) {
            // locate the course_module wrapping this assignment/quiz instance
            $module = DB::selectOne(
                "SELECT id FROM course_modules
                  WHERE course_id = ? AND module_type = ? AND instance_id = ? LIMIT 1",
                [$courseId, $moduleType, $instanceId]
            );
            // module_id may be null if the activity isn't slotted into a section yet;
            // we still create a grade_item keyed by name so grades aren't lost.
            $moduleId = $module->id ?? null;

            $existing = $moduleId
                ? DB::selectOne("SELECT id FROM grade_items WHERE course_id = ? AND module_id = ? LIMIT 1", [$courseId, $moduleId])
                : DB::selectOne("SELECT id FROM grade_items WHERE course_id = ? AND item_type='manual' AND name = ? LIMIT 1", [$courseId, $name]);
            if ($existing) {
                return $existing->id;
            }

            // 'mod' items require a module_id (gi_mod_ref_chk); when the activity
            // isn't slotted into a section yet, fall back to a 'manual' item.
            if ($moduleId !== null) {
                $row = DB::selectOne(
                    "INSERT INTO grade_items (tenant_id, course_id, item_type, module_id, name, grademin, grademax)
                     VALUES (?, ?, 'mod', ?, ?, 0, ?)
                     RETURNING id",
                    [$tenantId, $courseId, $moduleId, $name, $gradeMax]
                );
            } else {
                $row = DB::selectOne(
                    "INSERT INTO grade_items (tenant_id, course_id, item_type, name, grademin, grademax)
                     VALUES (?, ?, 'manual', ?, 0, ?)
                     RETURNING id",
                    [$tenantId, $courseId, $name, $gradeMax]
                );
            }

            return $row->id;
        });
    }

    /** Record an activity's grade into the gradebook (creates item if needed). */
    public function recordModuleGrade(string $tenantId, string $courseId, string $moduleType, string $instanceId, string $name, string $userId, ?float $rawGrade, float $gradeMax, ?string $markerId, string $source): object
    {
        $gradeItemId = $this->ensureModuleGradeItem($tenantId, $courseId, $moduleType, $instanceId, $name, $gradeMax);

        $result = $this->setGrade($tenantId, [
            'gradeItemId' => $gradeItemId,
            'userId' => $userId,
            'rawgrade' => $rawGrade,
            'finalgrade' => $rawGrade,
            'source' => $source,
            'workflowState' => 'released',
        ], $markerId);

        // Recompute the course summary so the student's /grades reflects this
        // immediately (audit §3.4 — recompute is wired to grade-write paths).
        $this->recomputeSummary($tenantId, $courseId, $userId);

        return $result;
    }

    // ── Grades (set one grade; appends history) ─────────────────────────────
    public function setGrade(string $tenantId, array $data, ?string $markerId): object
    {
        foreach (['gradeItemId', 'userId'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }
        $raw = $data['rawgrade'] ?? null;        // null = ungraded (NOT zero)
        $final = $data['finalgrade'] ?? $raw;
        $source = $data['source'] ?? 'manual';

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data, $raw, $final, $source, $markerId) {
            // previous value for history
            $prev = DB::selectOne(
                'SELECT finalgrade FROM grade_grades WHERE grade_item_id = ? AND user_id = ?',
                [$data['gradeItemId'], $data['userId']]
            );

            $row = DB::selectOne(
                "INSERT INTO grade_grades
                   (tenant_id, grade_item_id, user_id, rawgrade, finalgrade, feedback, marker_id, workflow_state)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT (tenant_id, grade_item_id, user_id) DO UPDATE SET
                   rawgrade = EXCLUDED.rawgrade,
                   finalgrade = EXCLUDED.finalgrade,
                   feedback = COALESCE(EXCLUDED.feedback, grade_grades.feedback),
                   marker_id = EXCLUDED.marker_id,
                   workflow_state = COALESCE(EXCLUDED.workflow_state, grade_grades.workflow_state)
                 RETURNING id, grade_item_id, user_id, rawgrade, finalgrade, workflow_state",
                [
                    $tenantId, $data['gradeItemId'], $data['userId'], $raw, $final,
                    isset($data['feedback']) ? json_encode($data['feedback']) : null,
                    $markerId, $data['workflowState'] ?? null,
                ]
            );

            // append to grade_history (append-only audit)
            DB::statement(
                "INSERT INTO grade_history
                   (tenant_id, grade_item_id, user_id, old_grade, new_grade, source, changed_by, reason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    $tenantId, $data['gradeItemId'], $data['userId'],
                    $prev->finalgrade ?? null, $final, $source, $markerId, $data['reason'] ?? null,
                ]
            );

            return $row;
        });
    }

    // ── Aggregation: compute a category's value for a user ──────────────────
    // ── Recursive nested-category aggregation (audit §3.3 completion) ────────
    // Walks the grade_categories tree bottom-up: each category aggregates its
    // own leaf items + its child categories' subtotals, applying the category's
    // strategy and drop-lowest/keep-highest, rolling up to a course percentage.
    public function computeCourseTotal(string $tenantId, string $courseId, string $userId): ?float
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId, $userId) {
            // load the category tree for the course
            $cats = DB::select(
                'SELECT id, parent_id, aggregation, drop_lowest, keep_highest
                   FROM grade_categories WHERE course_id = ?',
                [$courseId]
            );

            // no categories → flat weighted percentage over all graded items
            if (empty($cats)) {
                return $this->flatPercent($courseId, $userId);
            }

            $childrenOf = [];
            $byId = [];
            $roots = [];
            foreach ($cats as $c) {
                $byId[$c->id] = $c;
                $childrenOf[$c->parent_id ?? '__root__'][] = $c->id;
                if ($c->parent_id === null) {
                    $roots[] = $c->id;
                }
            }

            // each category returns [earnedPct 0..1, weight] so parents can combine
            $evalCat = function (string $catId) use (&$evalCat, $childrenOf, $byId, $userId, $courseId): ?array {
                $cat = $byId[$catId];

                // leaf item fractions (score/max) in this category
                $items = DB::select(
                    "SELECT gg.finalgrade, gi.grademax, gi.weight, gi.aggregationcoef
                       FROM grade_items gi
                       JOIN grade_grades gg ON gg.grade_item_id = gi.id AND gg.user_id = ?
                      WHERE gi.category_id = ? AND gi.item_type IN ('mod','manual')
                        AND gg.rawgrade IS NOT NULL AND gg.excluded = false",
                    [$userId, $catId]
                );

                // fractions for drop/keep (each as pct of its own max)
                $fractions = [];
                $extra = 0.0;
                foreach ($items as $it) {
                    $max = (float) $it->grademax;
                    if ($max <= 0) {
                        continue;
                    }
                    $frac = (float) $it->finalgrade / $max;
                    if (((float) ($it->aggregationcoef ?? 0)) > 0) {
                        $extra += $frac;     // extra credit, not subject to drop
                    } else {
                        $fractions[] = $frac;
                    }
                }
                sort($fractions);
                if ($cat->drop_lowest > 0 && count($fractions) > $cat->drop_lowest) {
                    $fractions = array_slice($fractions, $cat->drop_lowest);
                }
                if ($cat->keep_highest > 0 && count($fractions) > $cat->keep_highest) {
                    $fractions = array_slice($fractions, -$cat->keep_highest);
                }

                // child category subtotals
                $childPcts = [];
                foreach (($childrenOf[$catId] ?? []) as $childId) {
                    $sub = $evalCat($childId);
                    if ($sub !== null) {
                        $childPcts[] = $sub[0];
                    }
                }

                $all = array_merge($fractions, $childPcts);
                if (empty($all)) {
                    return null;
                }

                $pct = match ($cat->aggregation) {
                    'mean', 'weighted_mean', 'simple_weighted_mean' => array_sum($all) / count($all),
                    'median' => $this->median($all),
                    'min' => min($all),
                    'max' => max($all),
                    // 'natural' = mean of fractions (each item equally weighted by its own max)
                    default => array_sum($all) / count($all),
                };
                $pct = min(1.0, $pct + $extra);   // extra credit can lift, capped at 100%

                return [$pct, 1.0];
            };

            // combine root categories (equal weight) + any uncategorized items
            $rootPcts = [];
            foreach ($roots as $rootId) {
                $r = $evalCat($rootId);
                if ($r !== null) {
                    $rootPcts[] = $r[0];
                }
            }
            // items with no category at all
            $uncat = $this->flatPercentUncategorized($courseId, $userId);
            if ($uncat !== null) {
                $rootPcts[] = $uncat / 100;
            }

            if (empty($rootPcts)) {
                return null;
            }

            return round((array_sum($rootPcts) / count($rootPcts)) * 100, 3);
        });
    }

    private function flatPercent(string $courseId, string $userId): ?float
    {
        $r = DB::selectOne(
            "SELECT COALESCE(SUM(gg.finalgrade),0) AS earned, COALESCE(SUM(gi.grademax),0) AS possible
               FROM grade_items gi JOIN grade_grades gg ON gg.grade_item_id = gi.id AND gg.user_id = ?
              WHERE gi.course_id = ? AND gi.item_type IN ('mod','manual')
                AND gg.rawgrade IS NOT NULL AND gg.excluded = false",
            [$userId, $courseId]
        );

        return ($r->possible > 0) ? round(($r->earned / $r->possible) * 100, 3) : null;
    }

    private function flatPercentUncategorized(string $courseId, string $userId): ?float
    {
        $r = DB::selectOne(
            "SELECT COALESCE(SUM(gg.finalgrade),0) AS earned, COALESCE(SUM(gi.grademax),0) AS possible
               FROM grade_items gi JOIN grade_grades gg ON gg.grade_item_id = gi.id AND gg.user_id = ?
              WHERE gi.course_id = ? AND gi.item_type IN ('mod','manual') AND gi.category_id IS NULL
                AND gg.rawgrade IS NOT NULL AND gg.excluded = false",
            [$userId, $courseId]
        );

        return ($r->possible > 0) ? round(($r->earned / $r->possible) * 100, 3) : null;
    }

    public function aggregateCategory(string $tenantId, string $categoryId, string $userId): ?float
    {
        return TenantContext::withTenant($tenantId, function () use ($categoryId, $userId) {
            $cat = DB::selectOne(
                'SELECT aggregation, drop_lowest, keep_highest FROM grade_categories WHERE id = ?',
                [$categoryId]
            );
            if (! $cat) {
                throw new HttpException(404, 'Grade category not found');
            }

            // leaf grades in this category, excluding ungraded (NULL) and excluded
            $rows = DB::select(
                "SELECT gg.finalgrade
                   FROM grade_items gi
                   JOIN grade_grades gg ON gg.grade_item_id = gi.id AND gg.user_id = ?
                  WHERE gi.category_id = ? AND gi.item_type = 'mod'
                    AND gg.rawgrade IS NOT NULL AND gg.excluded = false
                  ORDER BY gg.finalgrade",
                [$userId, $categoryId]
            );
            $vals = array_map(fn ($r) => (float) $r->finalgrade, $rows);

            if ($cat->aggregation === 'natural') {
                return array_sum($vals);
            }
            if (empty($vals)) {
                return null;
            }

            // drop lowest N (vals sorted ascending)
            if ($cat->drop_lowest > 0 && count($vals) > $cat->drop_lowest) {
                $vals = array_slice($vals, $cat->drop_lowest);
            }
            // keep highest N
            if ($cat->keep_highest > 0 && count($vals) > $cat->keep_highest) {
                $vals = array_slice($vals, count($vals) - $cat->keep_highest);
            }

            return match ($cat->aggregation) {
                'mean' => array_sum($vals) / count($vals),
                'min' => min($vals),
                'max' => max($vals),
                'median' => $this->median($vals),
                default => array_sum($vals) / count($vals),
            };
        });
    }

    private function median(array $vals): float
    {
        sort($vals);
        $n = count($vals);
        $mid = intdiv($n, 2);

        return $n % 2 ? $vals[$mid] : ($vals[$mid - 1] + $vals[$mid]) / 2;
    }

    // ── Recompute the denormalized summary for one user in a course ─────────
    public function recomputeSummary(string $tenantId, string $courseId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId, $userId) {
            // Pull each graded mod item with its weight + extra-credit flag so we
            // can aggregate properly instead of a flat sum (audit §3.3).
            $rows = DB::select(
                "SELECT gi.id, gi.grademax, gi.weight, gi.aggregationcoef,
                        gg.finalgrade
                   FROM grade_items gi
                   JOIN grade_grades gg ON gg.grade_item_id = gi.id AND gg.user_id = ?
                  WHERE gi.course_id = ? AND gi.item_type IN ('mod','manual')
                    AND gg.rawgrade IS NOT NULL AND gg.excluded = false",
                [$userId, $courseId]
            );

            // Course aggregation strategy (default 'natural' = weighted sum of points).
            $cat = DB::selectOne(
                "SELECT aggregation FROM grade_categories
                  WHERE course_id = ? AND parent_id IS NULL LIMIT 1",
                [$courseId]
            );
            $strategy = $cat->aggregation ?? 'natural';

            // If the course uses grade categories, compute the proper nested
            // category-tree roll-up (audit §3.3). Otherwise use flat weighting.
            $hasCategories = DB::selectOne(
                'SELECT EXISTS(SELECT 1 FROM grade_categories WHERE course_id = ?) AS has',
                [$courseId]
            );

            $earned = 0.0; $possible = 0.0; $extra = 0.0;
            $weightedScoreSum = 0.0; $weightSum = 0.0;
            foreach ($rows as $r) {
                $max = (float) $r->grademax;
                $score = (float) $r->finalgrade;
                $isExtra = ((float) ($r->aggregationcoef ?? 0)) > 0;
                $weight = $r->weight !== null ? (float) $r->weight : $max; // default weight = points

                if ($isExtra) {
                    $extra += $score;   // extra-credit adds to numerator, not denominator
                    continue;
                }
                $earned += $score;
                $possible += $max;
                if ($max > 0) {
                    $weightedScoreSum += ($score / $max) * $weight;
                    $weightSum += $weight;
                }
            }

            $pct = match ($strategy) {
                'weighted_mean', 'simple_weighted_mean' =>
                    $weightSum > 0 ? round((($weightedScoreSum / $weightSum) * 100) + ($possible > 0 ? ($extra / $possible) * 100 : 0), 3) : null,
                'mean' =>
                    count($rows) > 0 && $possible > 0 ? round((($earned + $extra) / $possible) * 100, 3) : null,
                // 'natural' (default): weighted sum of points + extra credit
                default =>
                    $possible > 0 ? round((($earned + $extra) / $possible) * 100, 3) : null,
            };
            $total = $earned + $extra;
            $maxtotal = $possible;

            // when the course has categories, the authoritative percentage comes
            // from the recursive tree roll-up (handles nesting + per-cat strategy)
            if ($hasCategories && $hasCategories->has) {
                $treePct = $this->computeCourseTotal($tenantId, $courseId, $userId);
                if ($treePct !== null) {
                    $pct = $treePct;
                }
            }

            $items = DB::select(
                "SELECT gg.grade_item_id, gg.finalgrade
                   FROM grade_items gi
                   JOIN grade_grades gg ON gg.grade_item_id = gi.id AND gg.user_id = ?
                  WHERE gi.course_id = ?",
                [$userId, $courseId]
            );
            $itemMap = [];
            foreach ($items as $i) {
                $itemMap[$i->grade_item_id] = $i->finalgrade;
            }

            return DB::selectOne(
                "INSERT INTO gradebook_summary (tenant_id, course_id, user_id, course_total, course_total_pct, items, computed_at)
                 VALUES (?, ?, ?, ?, ?, ?, now())
                 ON CONFLICT (tenant_id, course_id, user_id) DO UPDATE SET
                   course_total = EXCLUDED.course_total,
                   course_total_pct = EXCLUDED.course_total_pct,
                   items = EXCLUDED.items,
                   computed_at = now()
                 RETURNING course_id, user_id, course_total, course_total_pct",
                [$tenantId, $courseId, $userId, $total, $pct, json_encode($itemMap)]
            );
        });
    }

    public function getSummary(string $tenantId, string $courseId, string $userId): ?object
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId, $userId) {
            return DB::selectOne(
                'SELECT course_id, user_id, course_total, course_total_pct, items, computed_at
                   FROM gradebook_summary WHERE course_id = ? AND user_id = ?',
                [$courseId, $userId]
            );
        });
    }

    /** Every graded item for a learner, across all courses (for the student dashboard). */
    public function gradesForUser(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            return DB::select(
                "SELECT gi.course_id,
                        c.fullname AS course,
                        COALESCE(gi.name, 'Item') AS item,
                        gg.finalgrade AS points,
                        gi.grademax AS max
                   FROM grade_grades gg
                   JOIN grade_items gi ON gi.id = gg.grade_item_id
                   JOIN courses c ON c.id = gi.course_id
                  WHERE gg.user_id = ?
                    AND gg.finalgrade IS NOT NULL
                    AND gg.excluded = false
                    AND gi.item_type IN ('mod','manual')
                  ORDER BY c.fullname, gi.name",
                [$userId]
            );
        });
    }
}
