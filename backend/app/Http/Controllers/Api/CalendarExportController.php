<?php

namespace App\Http\Controllers\Api;

use App\Services\ICalService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class CalendarExportController extends Controller
{
    public function __construct(private ICalService $ical) {}

    public function export(Request $request): Response
    {
        $ics = $this->ical->exportAgenda(
            $request->attributes->get('tenantId'), $request->attributes->get('userId')
        );

        return response($ics, 200, [
            'Content-Type' => 'text/calendar; charset=utf-8',
            'Content-Disposition' => 'attachment; filename="agenda.ics"',
        ]);
    }
}
