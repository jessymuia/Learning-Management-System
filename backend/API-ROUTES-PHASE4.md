    // Add to authenticated routes in api.php
    
    // ── Enhanced Gradebook (async + calculated items) ──
    Route::get('/grades/course/{courseId}', [GradebookEnhancedController::class, 'courseGradebook']);
    Route::post('/grades/items', [GradebookEnhancedController::class, 'createItem'])
        ->middleware('authorize:grade.edit,tenant');
    Route::put('/grades/items/{itemId}', [GradebookEnhancedController::class, 'updateItem'])
        ->middleware('authorize:grade.edit,tenant');
    Route::post('/grades/items/{itemId}/calculate', [GradebookEnhancedController::class, 'recalculateItem'])
        ->middleware('authorize:grade.edit,tenant');
    Route::post('/grades/course/{courseId}/calculate', [GradebookEnhancedController::class, 'recalculateCourse'])
        ->middleware('authorize:grade.edit,tenant');

    // ── Conditional Availability ──
    Route::get('/activities/{activityId}/availability', [GradebookEnhancedController::class, 'checkActivityAvailability']);
    Route::get('/activities/{activityId}/next-available', [GradebookEnhancedController::class, 'getNextAvailable']);
