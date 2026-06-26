<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;

/**
 * ICalService — iCalendar (RFC 5545) export of a user's agenda (spec §3 Phase 3).
 * Produces a VCALENDAR string consumable by Google/Apple/Outlook calendars.
 */
class ICalService
{
    public function exportAgenda(string $tenantId, string $userId): string
    {
        $events = TenantContext::withTenant($tenantId, function () use ($userId) {
            return DB::select(
                "SELECT id, name, description, start_at, end_at
                   FROM calendar_events
                  WHERE scope = 'site'
                     OR (scope = 'user' AND user_id = ?)
                     OR (scope = 'course' AND course_id IN (
                          SELECT course_id FROM user_enrolments WHERE user_id = ? AND status = 'active'))
                  ORDER BY start_at",
                [$userId, $userId]
            );
        });

        $lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Atrium//LMS//EN', 'CALSCALE:GREGORIAN'];
        foreach ($events as $e) {
            $start = (new \DateTime($e->start_at))->format('Ymd\THis\Z');
            $end = $e->end_at ? (new \DateTime($e->end_at))->format('Ymd\THis\Z') : $start;
            $lines[] = 'BEGIN:VEVENT';
            $lines[] = 'UID:'.$e->id.'@atrium';
            $lines[] = 'DTSTAMP:'.gmdate('Ymd\THis\Z');
            $lines[] = 'DTSTART:'.$start;
            $lines[] = 'DTEND:'.$end;
            $lines[] = 'SUMMARY:'.$this->escape($e->name);
            if ($e->description) {
                $lines[] = 'DESCRIPTION:'.$this->escape($e->description);
            }
            $lines[] = 'END:VEVENT';
        }
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", $lines);
    }

    private function escape(string $s): string
    {
        return str_replace([',', ';', "\n"], ['\,', '\;', '\n'], $s);
    }
}
