<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * WebhookService — outbound webhook subscriptions + delivery records (spec §8).
 * Registers endpoints and enqueues deliveries; the actual HTTP POST with HMAC
 * signing is performed by a queue worker (idempotent, retried, dead-lettered).
 */
class WebhookService
{
    public function subscribe(string $tenantId, array $data): object
    {
        if (empty($data['url']) || empty($data['events'])) {
            throw new HttpException(400, 'url and events are required');
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                'INSERT INTO webhooks (tenant_id, url, secret, events, active)
                 VALUES (?, ?, ?, ?, true)
                 RETURNING id, url, events, active',
                [
                    $tenantId, $data['url'],
                    $data['secret'] ?? bin2hex(random_bytes(16)),
                    json_encode($data['events']),
                ]
            );
        });
    }

    /** Enqueue a delivery for every webhook subscribed to $eventName. */
    public function dispatch(string $tenantId, string $eventName, array $payload): int
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $eventName, $payload) {
            $hooks = DB::select(
                'SELECT id FROM webhooks WHERE active = true AND jsonb_exists(events, ?)',
                [$eventName]
            );
            $count = 0;
            foreach ($hooks as $h) {
                DB::statement(
                    "INSERT INTO webhook_deliveries (tenant_id, webhook_id, event_name, payload, status, attempts)
                     VALUES (?, ?, ?, ?, 'queued', 0)",
                    [$tenantId, $h->id, $eventName, json_encode($payload)]
                );
                $count++;
            }

            return $count;
        });
    }

    public function listSubscriptions(string $tenantId): array
    {
        return TenantContext::withTenant($tenantId, function () {
            return DB::select('SELECT id, url, events, active, created_at FROM webhooks ORDER BY created_at DESC');
        });
    }
}
