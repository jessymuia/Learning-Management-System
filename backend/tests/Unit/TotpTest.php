<?php

namespace Tests\Unit;

use App\Services\SsoService;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

class TotpTest extends TestCase
{
    private SsoService $svc;
    private $b32;
    private $dec;
    private $hotp;

    protected function setUp(): void
    {
        if (! function_exists('config')) {
            function config($k = null, $d = null) { return 'test-secret'; }
        }
        $this->svc = new SsoService();
        $ref = new ReflectionClass($this->svc);
        $this->b32 = $ref->getMethod('base32'); $this->b32->setAccessible(true);
        $this->dec = $ref->getMethod('base32Decode'); $this->dec->setAccessible(true);
        $this->hotp = $ref->getMethod('hotp'); $this->hotp->setAccessible(true);
    }

    public function test_totp_code_verifies(): void
    {
        $secret = $this->b32->invoke($this->svc, random_bytes(20));
        $key = $this->dec->invoke($this->svc, $secret);
        $code = $this->hotp->invoke($this->svc, $key, (int) floor(time() / 30));
        $this->assertTrue($this->svc->verifyTotp($secret, $code));
    }

    public function test_wrong_code_rejected(): void
    {
        $secret = $this->b32->invoke($this->svc, random_bytes(20));
        $this->assertFalse($this->svc->verifyTotp($secret, '000000'));
    }

    public function test_code_is_six_digits(): void
    {
        $secret = $this->b32->invoke($this->svc, random_bytes(20));
        $key = $this->dec->invoke($this->svc, $secret);
        $code = $this->hotp->invoke($this->svc, $key, 100);
        $this->assertEquals(6, strlen($code));
    }
}
