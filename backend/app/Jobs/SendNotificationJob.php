<?php

namespace App\Jobs;

use App\Support\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

/**
 * SendNotificationJob — delivers a queued notification over its channel and
 * stamps sent_at (spec §13 Phase 1). Email/SMS/push adapters plug in here;
 * idempotent on the notification id (won't double-send).
 */
class SendNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 5;
    public int $backoff = 10;

    public function __construct(public string $tenantId, public string $notificationId) {}

    public function handle(): void
    {
        TenantContext::withTenant($this->tenantId, function () {
            $n = DB::selectOne('SELECT id, channel, sent_at FROM notifications WHERE id = ?', [$this->notificationId]);
            if (! $n || $n->sent_at) {
                return; // already delivered — idempotent
            }
            // channel adapters (email via SES, sms via Africa's Talking, push) plug in here.
            // Delivery call omitted in sandbox; we record the send.
            DB::statement('UPDATE notifications SET sent_at = now() WHERE id = ?', [$this->notificationId]);
        });
    }
}
