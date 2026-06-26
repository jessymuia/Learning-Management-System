<?php

namespace Tests\Unit;

use App\Services\CalculatedGradeService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

class CalculatedGradeDagTest extends TestCase
{
    private function call(string $method, ...$args)
    {
        $svc = new CalculatedGradeService();
        $m = (new ReflectionClass($svc))->getMethod($method);
        $m->setAccessible(true);

        return $m->invoke($svc, ...$args);
    }

    public function test_acyclic_graph_has_no_cycle(): void
    {
        $g = ['A' => ['B'], 'B' => ['C'], 'C' => []];
        $this->assertFalse($this->call('hasCycle', $g));
    }

    public function test_cycle_is_detected(): void
    {
        $g = ['A' => ['B'], 'B' => ['A']];
        $this->assertTrue($this->call('hasCycle', $g));
    }

    public function test_self_reference_is_a_cycle(): void
    {
        $g = ['A' => ['A']];
        $this->assertTrue($this->call('hasCycle', $g));
    }

    public function test_topological_order_is_dependencies_first(): void
    {
        $g = ['A' => ['B'], 'B' => ['C'], 'C' => []];
        $order = $this->call('topoSort', $g);
        $this->assertLessThan(array_search('A', $order), array_search('C', $order));
        $this->assertLessThan(array_search('A', $order), array_search('B', $order));
    }

    public function test_formula_ref_extraction(): void
    {
        $refs = $this->call('extractRefs', '##11111111-1111-1111-1111-111111111111## + ##22222222-2222-2222-2222-222222222222##');
        $this->assertCount(2, $refs);
    }
}
