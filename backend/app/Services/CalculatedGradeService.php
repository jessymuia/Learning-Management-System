<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * CalculatedGradeService — calculated grade items whose value is a formula over
 * other items (spec §5.3, §5.4). Formulas form a dependency DAG; circular
 * references are detected and REJECTED at save time, and recomputation is
 * topologically ordered. Formula refs use ##itemId## tokens.
 */
class CalculatedGradeService
{
    /** Save a formula for a grade item after verifying it adds no cycle. */
    public function setFormula(string $tenantId, string $gradeItemId, string $formula): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $gradeItemId, $formula) {
            $item = DB::selectOne('SELECT id, course_id FROM grade_items WHERE id = ?', [$gradeItemId]);
            if (! $item) {
                throw new HttpException(404, 'Grade item not found');
            }

            $deps = $this->extractRefs($formula);

            // build current dependency graph for the course + the proposed edge
            $graph = $this->loadGraph($item->course_id);
            $graph[$gradeItemId] = $deps;

            if ($this->hasCycle($graph)) {
                throw new HttpException(422, 'Formula creates a circular reference and was rejected');
            }

            DB::statement(
                "UPDATE grade_items SET calc_formula = ? WHERE id = ?",
                [$formula, $gradeItemId]
            );

            return (object) ['grade_item_id' => $gradeItemId, 'formula' => $formula, 'depends_on' => $deps];
        });
    }

    /** Topologically ordered recompute sequence for a course's calculated items. */
    public function recomputeOrder(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            $graph = $this->loadGraph($courseId);

            return $this->topoSort($graph);
        });
    }

    /** @return string[] referenced grade_item ids in a formula */
    private function extractRefs(string $formula): array
    {
        preg_match_all('/##([0-9a-f\-]{36})##/i', $formula, $m);

        return array_values(array_unique($m[1] ?? []));
    }

    /** @return array<string,string[]> adjacency: item => [deps] */
    private function loadGraph(string $courseId): array
    {
        $rows = DB::select(
            "SELECT id, calc_formula FROM grade_items
              WHERE course_id = ? AND calc_formula IS NOT NULL",
            [$courseId]
        );
        $graph = [];
        foreach ($rows as $r) {
            $graph[$r->id] = $this->extractRefs($r->calc_formula);
        }

        return $graph;
    }

    /** DFS cycle detection (gray/black colouring). */
    private function hasCycle(array $graph): bool
    {
        $state = []; // 1 = visiting, 2 = done
        $visit = function ($node) use (&$visit, &$state, $graph) {
            if (($state[$node] ?? 0) === 1) {
                return true;
            }
            if (($state[$node] ?? 0) === 2) {
                return false;
            }
            $state[$node] = 1;
            foreach ($graph[$node] ?? [] as $dep) {
                if ($visit($dep)) {
                    return true;
                }
            }
            $state[$node] = 2;

            return false;
        };
        foreach (array_keys($graph) as $node) {
            if ($visit($node)) {
                return true;
            }
        }

        return false;
    }

    /** Kahn's algorithm — dependencies first. */
    private function topoSort(array $graph): array
    {
        $indeg = [];
        foreach ($graph as $node => $deps) {
            $indeg[$node] = $indeg[$node] ?? 0;
            foreach ($deps as $d) {
                $indeg[$node]++;
            }
        }
        // process: nodes whose deps are satisfied first
        $order = [];
        $resolved = [];
        $changed = true;
        while ($changed) {
            $changed = false;
            foreach ($graph as $node => $deps) {
                if (isset($resolved[$node])) {
                    continue;
                }
                if (count(array_diff($deps, array_keys($resolved))) === 0) {
                    $order[] = $node;
                    $resolved[$node] = true;
                    $changed = true;
                }
            }
        }

        return $order;
    }
}
