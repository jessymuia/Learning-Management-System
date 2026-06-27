<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Availability rule resolver.
 * 
 * Determines if a user can access a learning activity based on:
 * - Completion of prerequisites
 * - Date restrictions (availableFrom, availableUntil)
 * - Grade restrictions (minGrade, maxGrade)
 * - Time restrictions (maxTime)
 */
class AvailabilityResolver
{
    /**
     * Check if an activity is available to a user.
     * 
     * Returns: {
     *   available: bool,
     *   reason: string,  // why it's unavailable (if applicable)
     *   prerequisites: array,  // list of incomplete prerequisites
     *   nextAvailableAt: DateTime,  // when it becomes available (if applicable)
     * }
     */
    public static function checkAvailability(
        string $userId,
        string $activityId,
        string $tenantId
    ): array {
        $activity = DB::table('activities')
            ->where('id', $activityId)
            ->where('tenant_id', $tenantId)
            ->first();

        if (!$activity) {
            return [
                'available' => false,
                'reason' => 'Activity not found',
                'prerequisites' => [],
            ];
        }

        // Check date restrictions
        $dateCheck = self::checkDateRestrictions($activity);
        if (!$dateCheck['available']) {
            return $dateCheck;
        }

        // Check completion prerequisites
        $completionCheck = self::checkCompletionPrerequisites($userId, $activity, $tenantId);
        if (!$completionCheck['available']) {
            return $completionCheck;
        }

        // Check grade restrictions
        $gradeCheck = self::checkGradeRestrictions($userId, $activity, $tenantId);
        if (!$gradeCheck['available']) {
            return $gradeCheck;
        }

        // Check time restrictions
        $timeCheck = self::checkTimeRestrictions($userId, $activityId, $tenantId);
        if (!$timeCheck['available']) {
            return $timeCheck;
        }

        return ['available' => true, 'prerequisites' => []];
    }

    /**
     * Check if activity is within its date window.
     */
    private static function checkDateRestrictions(object $activity): array
    {
        $now = now();

        if ($activity->available_from && $now < $activity->available_from) {
            return [
                'available' => false,
                'reason' => 'Activity not yet available',
                'nextAvailableAt' => $activity->available_from,
                'prerequisites' => [],
            ];
        }

        if ($activity->available_until && $now > $activity->available_until) {
            return [
                'available' => false,
                'reason' => 'Activity is no longer available',
                'prerequisites' => [],
            ];
        }

        return ['available' => true, 'prerequisites' => []];
    }

    /**
     * Check if completion prerequisites are satisfied.
     */
    private static function checkCompletionPrerequisites(
        string $userId,
        object $activity,
        string $tenantId
    ): array {
        if (!$activity->completion_data) {
            return ['available' => true, 'prerequisites' => []];
        }

        $prerequisites = json_decode($activity->completion_data, true);
        $incomplete = [];

        if (isset($prerequisites['require_completion'])) {
            foreach ($prerequisites['require_completion'] as $requiredActivityId) {
                $isComplete = DB::table('activity_completion')
                    ->where('user_id', $userId)
                    ->where('activity_id', $requiredActivityId)
                    ->where('state', 1) // COMPLETED
                    ->exists();

                if (!$isComplete) {
                    $incomplete[] = $requiredActivityId;
                }
            }
        }

        if (!empty($incomplete)) {
            return [
                'available' => false,
                'reason' => 'Incomplete prerequisites',
                'prerequisites' => $incomplete,
            ];
        }

        return ['available' => true, 'prerequisites' => []];
    }

    /**
     * Check if grade restrictions are satisfied.
     */
    private static function checkGradeRestrictions(
        string $userId,
        object $activity,
        string $tenantId
    ): array {
        if (!$activity->grade_restrictions_data) {
            return ['available' => true, 'prerequisites' => []];
        }

        $restrictions = json_decode($activity->grade_restrictions_data, true);
        $userGrade = DB::table('grade_grades as gg')
            ->join('grade_items as gi', 'gi.id', '=', 'gg.item_id')
            ->where('gg.user_id', $userId)
            ->where('gi.id', $activity->grade_item_id)
            ->value('gg.rawgrade');

        if ($userGrade === null) {
            $userGrade = 0;
        }

        if (isset($restrictions['min_grade']) && $userGrade < $restrictions['min_grade']) {
            return [
                'available' => false,
                'reason' => "Minimum grade {$restrictions['min_grade']} required",
                'prerequisites' => [],
            ];
        }

        if (isset($restrictions['max_grade']) && $userGrade > $restrictions['max_grade']) {
            return [
                'available' => false,
                'reason' => "Maximum grade {$restrictions['max_grade']} exceeded",
                'prerequisites' => [],
            ];
        }

        return ['available' => true, 'prerequisites' => []];
    }

    /**
     * Check if time restrictions are satisfied.
     */
    private static function checkTimeRestrictions(
        string $userId,
        string $activityId,
        string $tenantId
    ): array {
        $activity = DB::table('activities')->where('id', $activityId)->first();

        if (!$activity->time_limit_seconds) {
            return ['available' => true, 'prerequisites' => []];
        }

        // Check if user has already exceeded their time limit
        $timeSpent = DB::table('activity_attempts')
            ->where('user_id', $userId)
            ->where('activity_id', $activityId)
            ->sum('time_spent');

        if ($timeSpent > $activity->time_limit_seconds) {
            return [
                'available' => false,
                'reason' => 'Time limit exceeded',
                'prerequisites' => [],
            ];
        }

        return ['available' => true, 'prerequisites' => []];
    }

    /**
     * Get the next available activity in a sequence.
     */
    public static function getNextAvailable(
        string $userId,
        string $currentActivityId,
        string $courseId,
        string $tenantId
    ): ?object {
        $current = DB::table('activities')
            ->where('id', $currentActivityId)
            ->first();

        if (!$current) {
            return null;
        }

        // Get activities in the same unit/section, ordered by sequence
        $next = DB::table('activities')
            ->where('unit_id', $current->unit_id)
            ->where('sequence', '>', $current->sequence)
            ->orderBy('sequence')
            ->first();

        if (!$next) {
            return null;
        }

        // Check if it's available
        $availabilityCheck = self::checkAvailability($userId, $next->id, $tenantId);
        if ($availabilityCheck['available']) {
            return $next;
        }

        // Recursively find the next available
        return self::getNextAvailable($userId, $next->id, $courseId, $tenantId);
    }
}
