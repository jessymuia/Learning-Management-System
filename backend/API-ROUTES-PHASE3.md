    // Add to authenticated routes in api.php
    
    // ── System Settings (SUPER_ADMIN only) ──
    Route::get('/admin/settings', [SystemSettingsController::class, 'index'])
        ->middleware('operator');
    Route::put('/admin/settings/{section}', [SystemSettingsController::class, 'update'])
        ->middleware('operator');
    Route::post('/admin/settings/test-connection', [SystemSettingsController::class, 'testConnection'])
        ->middleware('operator');

    // ── Integration Credentials (SUPER_ADMIN only) ──
    Route::get('/admin/integrations', [IntegrationCredentialsController::class, 'index'])
        ->middleware('operator');
    Route::post('/admin/integrations', [IntegrationCredentialsController::class, 'store'])
        ->middleware('operator');
    Route::get('/admin/integrations/{provider}', [IntegrationCredentialsController::class, 'show'])
        ->middleware('operator');
    Route::delete('/admin/integrations/{provider}', [IntegrationCredentialsController::class, 'destroy'])
        ->middleware('operator');
    Route::post('/admin/integrations/{provider}/test', [IntegrationCredentialsController::class, 'test'])
        ->middleware('operator');
