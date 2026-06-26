<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * ThemingService — per-tenant white-label branding (spec §13 Phase 1, §10).
 * Branding (logo, colors, name) lives in tenants.settings.branding and is served
 * publicly by slug so the frontend can theme the login page before auth.
 */
class ThemingService
{
    public function getBranding(string $tenantSlug): ?object
    {
        return TenantContext::withSystem(function () use ($tenantSlug) {
            $t = DB::selectOne(
                "SELECT name, slug, settings FROM tenants WHERE slug = ? AND status = 'active'",
                [$tenantSlug]
            );
            if (! $t) {
                return null;
            }
            $settings = is_string($t->settings) ? json_decode($t->settings, true) : (array) $t->settings;
            $branding = $settings['branding'] ?? [];

            return (object) [
                'name' => $branding['displayName'] ?? $t->name,
                'slug' => $t->slug,
                'logoUrl' => $branding['logoUrl'] ?? null,
                'primaryColor' => $branding['primaryColor'] ?? '#2563a8',
                'accentColor' => $branding['accentColor'] ?? '#b07d2b',
                'defaultTheme' => $branding['defaultTheme'] ?? 'light',
            ];
        });
    }

    /** Branding for the current tenant (authed; used to theme the app shell). */
    public function getForTenant(string $tenantId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId) {
            $row = DB::selectOne('SELECT name, settings FROM tenants WHERE id = ?', [$tenantId]);
            $settings = is_string($row->settings) ? json_decode($row->settings, true) : (array) $row->settings;
            $branding = $settings['branding'] ?? [];

            return (object) [
                'name' => $branding['displayName'] ?? $row->name,
                'logoUrl' => $branding['logoUrl'] ?? null,
                'primaryColor' => $branding['primaryColor'] ?? '#2563a8',
                'accentColor' => $branding['accentColor'] ?? '#b07d2b',
                'defaultTheme' => $branding['defaultTheme'] ?? 'light',
            ];
        });
    }

    public function setBranding(string $tenantId, array $branding): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $branding) {
            $row = DB::selectOne('SELECT settings FROM tenants WHERE id = ?', [$tenantId]);
            $settings = is_string($row->settings) ? json_decode($row->settings, true) : (array) $row->settings;
            $settings['branding'] = array_merge($settings['branding'] ?? [], $branding);
            DB::statement('UPDATE tenants SET settings = ? WHERE id = ?', [json_encode($settings), $tenantId]);

            return (object) ['branding' => $settings['branding']];
        });
    }
}
