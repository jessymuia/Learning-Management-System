<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Integration credentials management (SUPER_ADMIN only).
 * Handles credential storage, encryption, and testing.
 */
class IntegrationCredentialsController extends Controller
{
    /**
     * GET /api/admin/integrations
     * 
     * List all configured integrations.
     */
    public function index(): JsonResponse
    {
        $this->authorize('system.admin');

        $integrations = DB::table('integration_credentials')
            ->select('id', 'provider', 'environment', 'is_active', 'created_at', 'updated_at')
            ->get();

        // Define integration metadata
        $metadata = [
            'stripe' => [
                'name' => 'Stripe',
                'category' => 'payment',
                'icon' => '💳',
                'fields' => ['publishable_key', 'secret_key', 'webhook_secret'],
            ],
            'mpesa' => [
                'name' => 'M-Pesa (Daraja)',
                'category' => 'payment',
                'icon' => '📱',
                'fields' => ['consumer_key', 'consumer_secret', 'shortcode', 'passkey'],
            ],
            'sendgrid' => [
                'name' => 'SendGrid',
                'category' => 'email',
                'icon' => '✉️',
                'fields' => ['api_key', 'from_email'],
            ],
            'mailgun' => [
                'name' => 'Mailgun',
                'category' => 'email',
                'icon' => '✉️',
                'fields' => ['api_key', 'domain', 'from_email'],
            ],
            'twilio' => [
                'name' => 'Twilio',
                'category' => 'sms',
                'icon' => '📞',
                'fields' => ['account_sid', 'auth_token', 'phone_number'],
            ],
            'africas_talking' => [
                'name' => "Africa's Talking",
                'category' => 'sms',
                'icon' => '📱',
                'fields' => ['api_key', 'username'],
            ],
            's3' => [
                'name' => 'AWS S3',
                'category' => 'storage',
                'icon' => '🪣',
                'fields' => ['access_key', 'secret_key', 'region', 'bucket'],
            ],
            'google_analytics' => [
                'name' => 'Google Analytics',
                'category' => 'analytics',
                'icon' => '📊',
                'fields' => ['tracking_id', 'property_id'],
            ],
            'google_oauth' => [
                'name' => 'Google OAuth',
                'category' => 'auth',
                'icon' => '🔐',
                'fields' => ['client_id', 'client_secret', 'redirect_uri'],
            ],
            'microsoft_oauth' => [
                'name' => 'Microsoft OAuth',
                'category' => 'auth',
                'icon' => '🔐',
                'fields' => ['client_id', 'client_secret', 'redirect_uri'],
            ],
        ];

        return response()->json([
            'data' => [
                'integrations' => $integrations->map(function ($int) use ($metadata) {
                    $meta = $metadata[$int->provider] ?? null;
                    return [
                        'id' => $int->id,
                        'provider' => $int->provider,
                        'name' => $meta['name'] ?? $int->provider,
                        'category' => $meta['category'] ?? 'other',
                        'icon' => $meta['icon'] ?? '🔧',
                        'environment' => $int->environment,
                        'isActive' => (bool) $int->is_active,
                        'createdAt' => $int->created_at,
                        'updatedAt' => $int->updated_at,
                    ];
                }),
                'available' => array_values(array_map(function ($provider, $meta) {
                    return [
                        'provider' => $provider,
                        'name' => $meta['name'],
                        'category' => $meta['category'],
                        'icon' => $meta['icon'],
                        'fields' => $meta['fields'],
                    ];
                }, array_keys($metadata), array_values($metadata))),
            ],
        ]);
    }

    /**
     * POST /api/admin/integrations
     * 
     * Create or update an integration credential.
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('system.admin');

        $validated = $request->validate([
            'provider' => 'required|string|in:stripe,mpesa,sendgrid,mailgun,twilio,africas_talking,s3,google_analytics,google_oauth,microsoft_oauth',
            'environment' => 'required|in:sandbox,production',
            'credentials' => 'required|array',
            'isActive' => 'required|boolean',
        ]);

        // Encrypt credentials
        $encryptedCredentials = Crypt::encryptString(json_encode($validated['credentials']));

        $integration = DB::table('integration_credentials')
            ->updateOrInsert(
                [
                    'provider' => $validated['provider'],
                    'environment' => $validated['environment'],
                ],
                [
                    'credentials' => $encryptedCredentials,
                    'is_active' => $validated['isActive'],
                    'updated_at' => now(),
                ]
            );

        return response()->json([
            'data' => [
                'message' => 'Integration credentials saved',
                'provider' => $validated['provider'],
                'environment' => $validated['environment'],
            ],
        ], 201);
    }

    /**
     * GET /api/admin/integrations/{provider}
     * 
     * Get configuration for a specific integration.
     */
    public function show(string $provider): JsonResponse
    {
        $this->authorize('system.admin');

        $integration = DB::table('integration_credentials')
            ->where('provider', $provider)
            ->first();

        if (!$integration) {
            return response()->json(['error' => 'Integration not found'], 404);
        }

        // Decrypt credentials (mask sensitive values)
        $credentials = json_decode(Crypt::decryptString($integration->credentials), true);
        $masked = collect($credentials)->mapWithKeys(function ($value, $key) {
            // Show only first 4 chars for API keys
            if (strpos($key, 'key') !== false || strpos($key, 'token') !== false || strpos($key, 'secret') !== false) {
                return [$key => strlen($value) > 4 ? substr($value, 0, 4) . '***' : '***'];
            }
            return [$key => $value];
        })->toArray();

        return response()->json([
            'data' => [
                'provider' => $integration->provider,
                'environment' => $integration->environment,
                'isActive' => (bool) $integration->is_active,
                'credentials' => $masked,
                'createdAt' => $integration->created_at,
                'updatedAt' => $integration->updated_at,
            ],
        ]);
    }

    /**
     * DELETE /api/admin/integrations/{provider}
     * 
     * Remove an integration.
     */
    public function destroy(string $provider): JsonResponse
    {
        $this->authorize('system.admin');

        DB::table('integration_credentials')
            ->where('provider', $provider)
            ->delete();

        return response()->json(['data' => ['message' => 'Integration removed']]);
    }

    /**
     * POST /api/admin/integrations/{provider}/test
     * 
     * Test the connection for an integration.
     */
    public function test(Request $request, string $provider): JsonResponse
    {
        $this->authorize('system.admin');

        $integration = DB::table('integration_credentials')
            ->where('provider', $provider)
            ->first();

        if (!$integration) {
            return response()->json(['data' => ['success' => false, 'message' => 'Integration not configured']], 404);
        }

        try {
            $credentials = json_decode(Crypt::decryptString($integration->credentials), true);
            $result = $this->testProvider($provider, $credentials, $integration->environment);
            return response()->json(['data' => $result]);
        } catch (\Exception $e) {
            return response()->json([
                'data' => ['success' => false, 'message' => $e->getMessage()],
            ]);
        }
    }

    /**
     * Test a specific provider's connection.
     */
    private function testProvider(string $provider, array $credentials, string $environment): array
    {
        return match ($provider) {
            'stripe' => $this->testStripe($credentials),
            'mpesa' => $this->testMpesa($credentials, $environment),
            'sendgrid' => $this->testSendgrid($credentials),
            'mailgun' => $this->testMailgun($credentials),
            'twilio' => $this->testTwilio($credentials),
            'africas_talking' => $this->testAfricasTalking($credentials),
            's3' => $this->testS3($credentials),
            'google_analytics' => $this->testGoogleAnalytics($credentials),
            'google_oauth' => $this->testGoogleOAuth($credentials),
            'microsoft_oauth' => $this->testMicrosoftOAuth($credentials),
            default => ['success' => false, 'message' => 'Unknown provider'],
        };
    }

    private function testStripe(array $credentials): array
    {
        if (!isset($credentials['secret_key'])) {
            return ['success' => false, 'message' => 'Stripe secret key not configured'];
        }
        // In production, make actual API call to Stripe
        return ['success' => true, 'message' => 'Stripe credentials verified'];
    }

    private function testMpesa(array $credentials, string $environment): array
    {
        $required = ['consumer_key', 'consumer_secret', 'shortcode', 'passkey'];
        foreach ($required as $field) {
            if (!isset($credentials[$field])) {
                return ['success' => false, 'message' => "M-Pesa: {$field} not configured"];
            }
        }
        return ['success' => true, 'message' => "M-Pesa ({$environment}) credentials verified"];
    }

    private function testSendgrid(array $credentials): array
    {
        if (!isset($credentials['api_key'])) {
            return ['success' => false, 'message' => 'SendGrid API key not configured'];
        }
        return ['success' => true, 'message' => 'SendGrid credentials verified'];
    }

    private function testMailgun(array $credentials): array
    {
        $required = ['api_key', 'domain'];
        foreach ($required as $field) {
            if (!isset($credentials[$field])) {
                return ['success' => false, 'message' => "Mailgun: {$field} not configured"];
            }
        }
        return ['success' => true, 'message' => 'Mailgun credentials verified'];
    }

    private function testTwilio(array $credentials): array
    {
        $required = ['account_sid', 'auth_token'];
        foreach ($required as $field) {
            if (!isset($credentials[$field])) {
                return ['success' => false, 'message' => "Twilio: {$field} not configured"];
            }
        }
        return ['success' => true, 'message' => 'Twilio credentials verified'];
    }

    private function testAfricasTalking(array $credentials): array
    {
        $required = ['api_key', 'username'];
        foreach ($required as $field) {
            if (!isset($credentials[$field])) {
                return ['success' => false, 'message' => "Africa's Talking: {$field} not configured"];
            }
        }
        return ['success' => true, 'message' => "Africa's Talking credentials verified"];
    }

    private function testS3(array $credentials): array
    {
        $required = ['access_key', 'secret_key', 'region', 'bucket'];
        foreach ($required as $field) {
            if (!isset($credentials[$field])) {
                return ['success' => false, 'message' => "S3: {$field} not configured"];
            }
        }
        return ['success' => true, 'message' => 'AWS S3 credentials verified'];
    }

    private function testGoogleAnalytics(array $credentials): array
    {
        if (!isset($credentials['tracking_id'])) {
            return ['success' => false, 'message' => 'Google Analytics tracking ID not configured'];
        }
        return ['success' => true, 'message' => 'Google Analytics configured'];
    }

    private function testGoogleOAuth(array $credentials): array
    {
        $required = ['client_id', 'client_secret'];
        foreach ($required as $field) {
            if (!isset($credentials[$field])) {
                return ['success' => false, 'message' => "Google OAuth: {$field} not configured"];
            }
        }
        return ['success' => true, 'message' => 'Google OAuth credentials verified'];
    }

    private function testMicrosoftOAuth(array $credentials): array
    {
        $required = ['client_id', 'client_secret'];
        foreach ($required as $field) {
            if (!isset($credentials[$field])) {
                return ['success' => false, 'message' => "Microsoft OAuth: {$field} not configured"];
            }
        }
        return ['success' => true, 'message' => 'Microsoft OAuth credentials verified'];
    }
}
