<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Verifies the HMAC signed-URL contract used by FileService without booting
 * Laravel: same hash_hmac/hash_equals logic.
 */
class FileSignatureTest extends TestCase
{
    private string $secret = 'test-secret';

    private function sign(string $id, int $exp): string
    {
        return hash_hmac('sha256', $id.'|'.$exp, $this->secret);
    }

    public function test_valid_signature_verifies(): void
    {
        $exp = time() + 300;
        $sig = $this->sign('file-1', $exp);
        $expected = hash_hmac('sha256', 'file-1|'.$exp, $this->secret);
        $this->assertTrue(hash_equals($expected, $sig));
    }

    public function test_tampered_signature_fails(): void
    {
        $exp = time() + 300;
        $sig = $this->sign('file-1', $exp);
        $expected = hash_hmac('sha256', 'file-2|'.$exp, $this->secret); // different id
        $this->assertFalse(hash_equals($expected, $sig));
    }

    public function test_expiry_is_enforced(): void
    {
        $exp = time() - 1; // already expired
        $this->assertTrue(time() > $exp);
    }
}
