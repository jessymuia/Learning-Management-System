<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * AvailabilityService — conditional-release rules engine (spec §2.4, §3 Phase 3,
 * §13). Evaluates whether a module is available to a user given its
 * availability JSON. Supported conditions: date, grade, completion (of another
 * module). Rules combine with all/any operator. Same engine is reused for
 * program course unlock rules.
 *
 * availability JSON shape:
 *   { "op": "all"|"any", "rules": [
 *       {"type":"date","after":"2026-01-01T00:00:00Z"},
 *       {"type":"completion","moduleId":"...","state":1},
 *       {"type":"grade","gradeItemId":"...","min":50}
 *   ]}
 */
class AvailabilityService
{
    public function isModuleAvailable(string $tenantId, string $moduleId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($moduleId, $userId) {
            $module = DB::selectOne('SELECT id, availability FROM course_modules WHERE id = ?', [$moduleId]);
            if (! $module || ! $module->availability) {
                return ['available' => true, 'reasons' => []];
            }
            $rules = json_decode($module->availability, true);
            if (! is_array($rules) || empty($rules['rules'])) {
                return ['available' => true, 'reasons' => []];
            }

            return $this->evaluate($rules, $userId);
        });
    }

    /** Evaluate a rule set for a user (assumes open tenant tx). */
    public function evaluate(array $ruleset, string $userId): array
    {
        $op = $ruleset['op'] ?? 'all';
        $results = [];
        $reasons = [];

        foreach ($ruleset['rules'] as $rule) {
            [$ok, $reason] = $this->evalRule($rule, $userId);
            $results[] = $ok;
            if (! $ok) {
                $reasons[] = $reason;
            }
        }

        $available = $op === 'any'
            ? in_array(true, $results, true)
            : ! in_array(false, $results, true);

        return ['available' => $available, 'reasons' => $available ? [] : $reasons];
    }

    /** @return array{0:bool,1:string} */
    private function evalRule(array $rule, string $userId): array
    {
        switch ($rule['type'] ?? '') {
            case 'date':
                if (! empty($rule['after'])) {
                    $ok = now()->gte(\Carbon\Carbon::parse($rule['after']));

                    return [$ok, 'Available from '.$rule['after']];
                }
                if (! empty($rule['before'])) {
                    $ok = now()->lte(\Carbon\Carbon::parse($rule['before']));

                    return [$ok, 'Available until '.$rule['before']];
                }

                return [true, ''];

            case 'completion':
                $row = DB::selectOne(
                    'SELECT state FROM activity_completion WHERE module_id = ? AND user_id = ?',
                    [$rule['moduleId'] ?? '', $userId]
                );
                $need = $rule['state'] ?? 1;
                $ok = $row && (int) $row->state >= (int) $need;

                return [$ok, 'Complete the prerequisite activity first'];

            case 'grade':
                $row = DB::selectOne(
                    'SELECT finalgrade FROM grade_grades WHERE grade_item_id = ? AND user_id = ?',
                    [$rule['gradeItemId'] ?? '', $userId]
                );
                $min = $rule['min'] ?? 0;
                $ok = $row && $row->finalgrade !== null && (float) $row->finalgrade >= (float) $min;

                return [$ok, "Achieve at least {$min} on the prerequisite"];

            default:
                return [true, ''];
        }
    }
}
