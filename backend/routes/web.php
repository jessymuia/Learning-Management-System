<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    try {
        DB::select('SELECT 1');

        return response()->json(['status' => 'ok', 'db' => 'up']);
    } catch (\Throwable $e) {
        return response()->json(['status' => 'degraded', 'db' => 'down'], 503);
    }
});
