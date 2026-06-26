<?php

namespace App\Services;

use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * PrivacyService — GDPR + Kenya DPA 2019 data rights (spec §10, §13).
 * - export(): assembles all personal data held for a user (right to access)
 * - erase():  anonymises a user while preserving grade-retention obligations
 * - consent(): records a consent decision
 */
class PrivacyService
{
    /** Right to access — return all personal data held for the user. */
    public function export(string $tenantId, string $userId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($userId) {
            $user = DB::selectOne('SELECT id, email, profile, created_at FROM users WHERE id = ?', [$userId]);
            $enrolments = DB::select('SELECT course_id, status, start_at FROM user_enrolments WHERE user_id = ?', [$userId]);
            $grades = DB::select('SELECT grade_item_id, rawgrade, finalgrade, modified_at FROM grade_grades WHERE user_id = ?', [$userId]);
            $submissions = DB::select('SELECT assignment_id, state, submitted_at FROM submissions WHERE user_id = ?', [$userId]);
            $messages = DB::select('SELECT conversation_id, created_at FROM messages WHERE sender_id = ?', [$userId]);

            return [
                'subject' => $user,
                'enrolments' => $enrolments,
                'grades' => $grades,
                'submissions' => $submissions,
                'messages_meta' => $messages,
                'exported_at' => now()->toIso8601String(),
            ];
        });
    }

    /**
     * Right to erasure — anonymise PII while keeping grade records (legitimate
     * interest / legal retention exception per spec §10). Grades remain, but
     * are no longer linked to identifying data.
     */
    public function erase(string $tenantId, string $userId): object
    {
        return TenantContext::withSystem(function () use ($userId) {
            $user = DB::selectOne('SELECT id FROM users WHERE id = ?', [$userId]);
            if (! $user) {
                throw new HttpException(404, 'User not found');
            }
            $anonEmail = 'erased+'.substr(sha1($userId), 0, 12).'@anonymized.invalid';
            DB::statement(
                "UPDATE users SET email = ?, profile = '{}'::jsonb, status = 'erased', email_verified_at = NULL WHERE id = ?",
                [$anonEmail, $userId]
            );
            // remove auth credentials entirely
            DB::statement('DELETE FROM auth_methods WHERE user_id = ?', [$userId]);

            return (object) ['user_id' => $userId, 'status' => 'erased', 'grades_retained' => true];
        });
    }

    /** Record a consent decision (consent log for compliance). */
    public function recordConsent(string $tenantId, string $userId, string $purpose, bool $granted): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $userId, $purpose, $granted) {
            // store on the user profile under a consents key (append-only log)
            $row = DB::selectOne('SELECT profile FROM users WHERE id = ?', [$userId]);
            $profile = json_decode($row->profile ?? '{}', true);
            $profile['consents'][] = ['purpose' => $purpose, 'granted' => $granted, 'at' => now()->toIso8601String()];
            DB::statement('UPDATE users SET profile = ? WHERE id = ?', [json_encode($profile), $userId]);

            return (object) ['purpose' => $purpose, 'granted' => $granted];
        });
    }
}
