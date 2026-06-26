<?php

namespace Tests\Unit;

use App\Services\QuestionGradingService;
use PHPUnit\Framework\TestCase;

class QuestionGradingTest extends TestCase
{
    private QuestionGradingService $g;

    protected function setUp(): void
    {
        $this->g = new QuestionGradingService();
    }

    public function test_mcq_correct_and_wrong(): void
    {
        $this->assertEquals(1.0, $this->g->grade('mcq', ['correct' => 'A'], 'A'));
        $this->assertEquals(0.0, $this->g->grade('mcq', ['correct' => 'A'], 'B'));
    }

    public function test_truefalse(): void
    {
        $this->assertEquals(1.0, $this->g->grade('truefalse', ['correct' => 'true'], 'true'));
    }

    public function test_multichoice_all_or_nothing(): void
    {
        $this->assertEquals(1.0, $this->g->grade('multichoice', ['correct' => ['A', 'C']], ['C', 'A']));
        $this->assertEquals(0.0, $this->g->grade('multichoice', ['correct' => ['A', 'C']], ['A']));
    }

    public function test_multichoice_partial_credit(): void
    {
        $score = $this->g->grade('multichoice', ['correct' => ['A', 'B'], 'partial' => true], ['A']);
        $this->assertEquals(0.5, $score);
    }

    public function test_matching_fraction(): void
    {
        $data = ['pairs' => ['l1' => 'r1', 'l2' => 'r2']];
        $this->assertEquals(1.0, $this->g->grade('matching', $data, ['l1' => 'r1', 'l2' => 'r2']));
        $this->assertEquals(0.5, $this->g->grade('matching', $data, ['l1' => 'r1', 'l2' => 'X']));
    }

    public function test_shortanswer_case_insensitive(): void
    {
        $data = ['accept' => ['Paris', 'paris france']];
        $this->assertEquals(1.0, $this->g->grade('shortanswer', $data, '  PARIS '));
        $this->assertEquals(0.0, $this->g->grade('shortanswer', $data, 'London'));
    }

    public function test_numerical_tolerance(): void
    {
        $data = ['value' => 42, 'tolerance' => 0.5];
        $this->assertEquals(1.0, $this->g->grade('numerical', $data, 41.8));
        $this->assertEquals(0.0, $this->g->grade('numerical', $data, 45));
    }

    public function test_essay_is_manual(): void
    {
        $this->assertNull($this->g->grade('essay', [], 'a long answer'));
    }
}
