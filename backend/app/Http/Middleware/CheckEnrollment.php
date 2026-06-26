<?php

namespace App\Http\Middleware;

use App\Support\TenantContext;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class CheckEnrollment
{
    public function handle(Request $request, Closure $next, string $courseParam = 'id')
    {
        $user = auth()->user();
        if (!$user) {
            throw new HttpException(401, 'Unauthorized');
        }

        $courseId = $request->route($courseParam);
        $tenantId = $user->tenant_id ?? request('tenant_id');

        TenantContext::withTenant($tenantId, function () use ($user, $courseId) {
            $enrolled = DB::selectOne(
                'SELECT * FROM user_enrolments WHERE user_id = ? AND course_id = ? AND status = ?',
                [$user->id, $courseId, 'active']
            );

            if (!$enrolled) {
                throw new HttpException(403, 'Not enrolled in this course');
            }
        });

        return $next($request);
    }
}
