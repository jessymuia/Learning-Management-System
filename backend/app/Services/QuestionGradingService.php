<?php

namespace App\Services;

/**
 * QuestionGradingService — server-authoritative auto-grading of objective
 * question types (spec §5.0, §6.3). Given a question version's `data` (the
 * answer key) and the learner's response, returns a fraction in [0,1].
 *
 * Pure logic (no DB) so it is unit-testable and deterministic. Manual types
 * (essay) return null → routed to the marking workflow instead.
 *
 * question_versions.data shapes per qtype:
 *   mcq/truefalse:  { "correct": "A" }                      response: "A"
 *   multichoice:    { "correct": ["A","C"] }                response: ["A","C"]
 *   matching:       { "pairs": {"l1":"r1","l2":"r2"} }      response: {"l1":"r1",...}
 *   shortanswer:    { "accept": ["paris","paris france"] }  response: "Paris"
 *   numerical:      { "value": 42, "tolerance": 0.5 }       response: 41.8
 *   essay:          {}                                      → null (manual)
 */
class QuestionGradingService
{
    /** @return float|null fraction 0..1, or null if the type is manually graded */
    public function grade(string $qtype, array $data, $response): ?float
    {
        switch ($qtype) {
            case 'mcq':
            case 'truefalse':
                return $this->gradeSingle($data, $response);

            case 'multichoice':
                return $this->gradeMulti($data, $response);

            case 'matching':
                return $this->gradeMatching($data, $response);

            case 'shortanswer':
                return $this->gradeShortAnswer($data, $response);

            case 'numerical':
                return $this->gradeNumerical($data, $response);

            case 'essay':
            default:
                return null; // manual grading
        }
    }

    private function gradeSingle(array $data, $response): float
    {
        $correct = $data['correct'] ?? null;

        return ((string) $response === (string) $correct) ? 1.0 : 0.0;
    }

    /** All-or-nothing by default; partial credit if data.partial = true. */
    private function gradeMulti(array $data, $response): float
    {
        $correct = $data['correct'] ?? [];
        $resp = is_array($response) ? $response : [];
        sort($correct);
        $r = $resp;
        sort($r);

        if (! empty($data['partial'])) {
            // partial: +1 per correct selected, -1 per wrong selected, floored at 0
            $correctSet = array_flip($correct);
            $score = 0;
            foreach ($resp as $sel) {
                $score += isset($correctSet[$sel]) ? 1 : -1;
            }
            $max = max(1, count($correct));

            return max(0.0, $score / $max);
        }

        return ($r === $correct) ? 1.0 : 0.0;
    }

    /** Fraction of correctly matched pairs. */
    private function gradeMatching(array $data, $response): float
    {
        $pairs = $data['pairs'] ?? [];
        if (empty($pairs)) {
            return 0.0;
        }
        $resp = is_array($response) ? $response : [];
        $correct = 0;
        foreach ($pairs as $left => $right) {
            if (isset($resp[$left]) && (string) $resp[$left] === (string) $right) {
                $correct++;
            }
        }

        return $correct / count($pairs);
    }

    /** Case-insensitive, trimmed match against accepted answers. */
    private function gradeShortAnswer(array $data, $response): float
    {
        $accept = $data['accept'] ?? [];
        $norm = fn ($s) => mb_strtolower(trim((string) $s));
        $r = $norm($response);
        foreach ($accept as $a) {
            if ($norm($a) === $r) {
                return 1.0;
            }
        }

        return 0.0;
    }

    /** Within tolerance counts as correct. */
    private function gradeNumerical(array $data, $response): float
    {
        if (! is_numeric($response)) {
            return 0.0;
        }
        $value = (float) ($data['value'] ?? 0);
        $tol = (float) ($data['tolerance'] ?? 0);

        return (abs((float) $response - $value) <= $tol) ? 1.0 : 0.0;
    }
}
