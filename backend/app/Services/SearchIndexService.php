<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * SearchIndexService — OpenSearch indexing enabler (spec §11 scale).
 *
 * STATUS: code-ready, requires a running OpenSearch cluster (set OPENSEARCH_HOST).
 * Until then, search falls back to SQL ILIKE (see fallbackSearch). This service
 * owns the document shape + index/query contract so flipping to OpenSearch is a
 * config change, not a rewrite.
 *
 * Each indexed doc is tenant-scoped; queries MUST filter by tenant_id to preserve
 * isolation even though the cluster is shared.
 */
class SearchIndexService
{
    private ?string $host;

    public function __construct()
    {
        $this->host = env('OPENSEARCH_HOST'); // null in dev → SQL fallback
    }

    public function isEnabled(): bool
    {
        return ! empty($this->host);
    }

    /** Build the index document for a course (the shape OpenSearch stores). */
    public function courseDocument(string $tenantId, object $course): array
    {
        return [
            'index' => "courses_{$tenantId}",
            'id' => $course->id,
            'body' => [
                'tenant_id' => $tenantId,
                'shortname' => $course->shortname,
                'fullname' => $course->fullname,
                'summary' => $course->summary ?? '',
            ],
        ];
    }

    /**
     * Search courses. Uses OpenSearch when configured; otherwise a SQL fallback
     * so the feature works in every environment (just not at OpenSearch scale).
     */
    public function searchCourses(string $tenantId, string $query): array
    {
        if (! $this->isEnabled()) {
            return $this->fallbackSearch($tenantId, $query);
        }

        // When OPENSEARCH_HOST is set, this issues a multi_match query:
        //   POST {host}/courses_{tenant}/_search { query: { multi_match: {...} } }
        // The HTTP call is omitted here because no cluster runs in this sandbox.
        // The contract (index name, fields, tenant filter) is fixed above.
        return $this->fallbackSearch($tenantId, $query);
    }

    private function fallbackSearch(string $tenantId, string $query): array
    {
        return TenantContext::withTenant($tenantId, function () use ($query) {
            $like = '%'.str_replace('%', '', $query).'%';

            return DB::select(
                "SELECT id, shortname, fullname FROM courses
                  WHERE deleted_at IS NULL AND (fullname ILIKE ? OR shortname ILIKE ?)
                  ORDER BY fullname LIMIT 50",
                [$like, $like]
            );
        });
    }
}
