<?php

namespace App\Jobs;

use App\Services\GradebookService;
use App\Support\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * RecomputeGradebookJob — async, idempotent, coalesced gradebook recompute
 * (spec §5.4). Enqueue on grade change keyed by (course,user); the worker
 * recomputes the summary. Idempotent: re-running yields the same result.
 */
class RecomputeGradebookJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 5;

    public function __construct(
        public string $tenantId,
        public string $courseId,
        public string $userId
    ) {}

    /** Coalesce bursts: same (course,user) collapses to one job in-flight. */
    public function uniqueId(): string
    {
        return "{$this->tenantId}:{$this->courseId}:{$this->userId}";
    }

    public function handle(GradebookService $gradebook): void
    {
        $gradebook->recomputeSummary($this->tenantId, $this->courseId, $this->userId);
    }
}
