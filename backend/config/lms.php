<?php

return [
    'jwt' => [
        'secret' => env('JWT_SECRET', env('APP_KEY', 'insecure-dev-secret')),
        'access_ttl' => (int) env('JWT_ACCESS_TTL', 900),
        'refresh_ttl' => (int) env('JWT_REFRESH_TTL', 2592000),
    ],
    'frontend_origin' => env('FRONTEND_ORIGIN', 'http://localhost:3000'),
];
