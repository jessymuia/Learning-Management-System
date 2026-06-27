<?php

namespace App\Http\Controllers\Api;

use App\Services\ReportingService;
use Illuminate\Http\Request;
use App\Support\TenantContext;

class ReportingController extends Controller
{
    public function __construct(private ReportingService $reporting)
    {
    }

    public function tenantOverview(Request $request)
    {
        $user = auth()->user();
        $tenantId = $user->tenant_id ?? $request->input('tenant_id');

        return TenantContext::withTenant($tenantId, function () use ($tenantId) {
            return $this->reporting->getTenantOverview($tenantId);
        });
    }

    public function courseReport(Request $request, string $courseId)
    {
        $user = auth()->user();
        $tenantId = $user->tenant_id ?? $request->input('tenant_id');

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId) {
            return $this->reporting->getCourseReport($tenantId, $courseId);
        });
    }

    public function atRiskLearners(Request $request)
    {
        $user = auth()->user();
        $tenantId = $user->tenant_id ?? $request->input('tenant_id');
        $courseId = $request->query('courseId');

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId) {
            return $this->reporting->getAtRiskLearners($tenantId, $courseId);
        });
    }

    public function studentProgress(Request $request)
    {
        $user = auth()->user();
        $tenantId = $user->tenant_id ?? $request->input('tenant_id');

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $user) {
            return $this->reporting->getStudentProgress($tenantId, $user->id);
        });
    }
}
