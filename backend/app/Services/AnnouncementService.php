<?php

namespace App\Services;

use App\Jobs\SendNotificationJob;
use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * AnnouncementService — course announcements that fan out to enrolled learners
 * as queued notifications (spec §13 Phase 1). Each recipient gets a notification
 * row; the SendNotificationJob delivers via their preferred channel.
 */
class AnnouncementService
{
    public function post(string $tenantId, string $courseId, string $authorId, string $subject, array $body): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $courseId, $authorId, $subject, $body) {
            $course = DB::selectOne('SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL', [$courseId]);
            if (! $course) {
                throw new HttpException(404, 'Course not found');
            }

            $ann = DB::selectOne(
                'INSERT INTO announcements (tenant_id, course_id, author_id, subject, body)
                 VALUES (?, ?, ?, ?, ?) RETURNING id, subject, created_at',
                [$tenantId, $courseId, $authorId, $subject, json_encode($body)]
            );

            // fan out to active enrolees as notifications (queued for delivery)
            $learners = DB::select(
                "SELECT DISTINCT user_id FROM user_enrolments WHERE course_id = ? AND status = 'active'",
                [$courseId]
            );
            foreach ($learners as $l) {
                $n = DB::selectOne(
                    "INSERT INTO notifications (tenant_id, user_id, channel, type, payload)
                     VALUES (?, ?, 'email', 'announcement', ?) RETURNING id",
                    [$tenantId, $l->user_id, json_encode(['subject' => $subject, 'courseId' => $courseId])]
                );
                // enqueue delivery (worker stamps sent_at)
                if (class_exists(SendNotificationJob::class)) {
                    SendNotificationJob::dispatch($tenantId, $n->id);
                }
            }

            return (object) ['id' => $ann->id, 'subject' => $ann->subject, 'recipients' => count($learners)];
        });
    }

    public function listForCourse(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT id, subject, body, created_at FROM announcements
                  WHERE course_id = ? ORDER BY created_at DESC LIMIT 50',
                [$courseId]
            );
        });
    }
}
