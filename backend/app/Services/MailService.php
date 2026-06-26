<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * MailService — transactional email (spec §13 Phase 1).
 *
 * Sends real email via Laravel's Mail when a mailer is configured
 * (MAIL_MAILER=smtp|ses|... in .env). When no mailer is configured (e.g. local
 * dev / sandbox), it logs the message instead of failing, so flows that depend
 * on email still complete. Delivery in production requires real SMTP/SES creds.
 */
class MailService
{
    /** Send the welcome email containing login details for a new tenant admin. */
    public function sendTenantWelcome(string $toEmail, string $orgName, string $tempPassword, string $loginUrl): void
    {
        $subject = "Your {$orgName} workspace is ready";
        $body = $this->renderTenantWelcome($orgName, $toEmail, $tempPassword, $loginUrl);
        $this->send($toEmail, $subject, $body);
    }

    private function renderTenantWelcome(string $orgName, string $email, string $tempPassword, string $loginUrl): string
    {
        return <<<TXT
Welcome to {$orgName}!

Your organization has been created and you are its administrator.

Sign in here: {$loginUrl}

  Email:    {$email}
  Password: {$tempPassword}

Please change your password immediately after your first sign-in.

From here you can create courses, add teachers and students, and set up your programs.
TXT;
    }

    /**
     * Send an email. Uses the configured mailer; if none is set up, logs the
     * message (so dev/sandbox flows don't break) and returns gracefully.
     */
    public function send(string $to, string $subject, string $body): void
    {
        $mailer = config('mail.default') ?? env('MAIL_MAILER');

        if (! $mailer || $mailer === 'log' || $mailer === 'array') {
            // No real mailer configured — record it instead of failing.
            Log::info("[MailService] (no mailer configured) would send to {$to}: {$subject}\n{$body}");

            return;
        }

        try {
            Mail::raw($body, function ($message) use ($to, $subject) {
                $message->to($to)->subject($subject);
            });
        } catch (\Throwable $e) {
            // Never let a mail failure break the calling flow; log for retry.
            Log::warning("[MailService] send failed to {$to}: ".$e->getMessage());
        }
    }
}
