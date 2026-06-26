<?php

namespace App\Services;

use App\Services\GradebookService;
use App\Support\TenantContext;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * AssignmentService — assignments + submissions + the human-grading marking
 * workflow (spec §5.0, §7.4). Same TenantContext style as the rest.
 *
 * Submission state:        draft → submitted → graded → returned
 * Marking workflow_state:  notmarked → inmarking → complete → released
 */
class AssignmentService
{
    public function __construct(private GradebookService $gradebook) {}

    /** List assignments in a course (for the teacher grading picker). */
    public function listForCourse(string $tenantId, string $courseId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($courseId) {
            return DB::select(
                'SELECT a.id, a.title, a.due_at,
                        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submission_count,
                        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.workflow_state = '."'".'released'."'".') AS graded_count
                   FROM assignments a
                  WHERE a.course_id = ?
                  ORDER BY a.created_at DESC',
                [$courseId]
            );
        });
    }

        public function create(string $tenantId, array $data): object
    {
        foreach (['courseId', 'title'] as $req) {
            if (empty($data[$req])) {
                throw new HttpException(400, "$req is required");
            }
        }

        return TenantContext::withTenant($tenantId, function () use ($tenantId, $data) {
            return DB::selectOne(
                "INSERT INTO assignments
                   (tenant_id, course_id, title, instructions, due_at, cutoff_at,
                    max_attempts, submission_types, blind_marking, rubric_id)
                 VALUES (?, ?, ?, ?, ?, ?, COALESCE(?,1), COALESCE(?,'[\"file\"]'::jsonb),
                         COALESCE(?,false), ?)
                 RETURNING id, course_id, title, due_at, cutoff_at, max_attempts, blind_marking",
                [
                    $tenantId, $data['courseId'], $data['title'],
                    isset($data['instructions']) ? json_encode($data['instructions']) : null,
                    $data['dueAt'] ?? null, $data['cutoffAt'] ?? null,
                    $data['maxAttempts'] ?? null,
                    isset($data['submissionTypes']) ? json_encode($data['submissionTypes']) : null,
                    $data['blindMarking'] ?? null, $data['rubricId'] ?? null,
                ]
            );
        });
    }

    /** Create or update a draft submission for the calling learner. */
    public function saveSubmission(string $tenantId, string $assignmentId, string $userId, array $data): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $assignmentId, $userId, $data) {
            $asg = DB::selectOne('SELECT id, cutoff_at, due_at FROM assignments WHERE id = ?', [$assignmentId]);
            if (! $asg) {
                throw new HttpException(404, 'Assignment not found');
            }

            return DB::selectOne(
                "INSERT INTO submissions
                   (tenant_id, assignment_id, user_id, attempt_no, state, text_content)
                 VALUES (?, ?, ?, 1, 'draft', ?)
                 ON CONFLICT (tenant_id, assignment_id, user_id, attempt_no) DO UPDATE SET
                   text_content = EXCLUDED.text_content,
                   updated_at = now()
                 RETURNING id, state, attempt_no",
                [
                    $tenantId, $assignmentId, $userId,
                    isset($data['textContent']) ? json_encode($data['textContent']) : null,
                ]
            );
        });
    }

    /** Submit a draft (server enforces cutoff and late flagging). */
    public function submit(string $tenantId, string $assignmentId, string $userId): object
    {
        return TenantContext::withTenant($tenantId, function () use ($assignmentId, $userId) {
            $asg = DB::selectOne('SELECT id, due_at, cutoff_at FROM assignments WHERE id = ?', [$assignmentId]);
            if (! $asg) {
                throw new HttpException(404, 'Assignment not found');
            }

            // hard cutoff check (server-authoritative)
            $past = DB::selectOne(
                'SELECT (cutoff_at IS NOT NULL AND now() > cutoff_at) AS past_cutoff,
                        (due_at IS NOT NULL AND now() > due_at) AS is_late
                   FROM assignments WHERE id = ?',
                [$assignmentId]
            );
            if ($past->past_cutoff) {
                throw new HttpException(409, 'The cutoff date has passed; no submissions accepted');
            }

            $row = DB::selectOne(
                "UPDATE submissions
                    SET state = 'submitted', submitted_at = now(), is_late = ?,
                        workflow_state = 'notmarked'
                  WHERE assignment_id = ? AND user_id = ? AND attempt_no = 1 AND state = 'draft'
                  RETURNING id, state, submitted_at, is_late, workflow_state",
                [$past->is_late, $assignmentId, $userId]
            );
            if (! $row) {
                throw new HttpException(409, 'No draft submission to submit');
            }

            return $row;
        });
    }

    /** Marker grades a submission: sets grade, workflow state, feedback. */
    public function grade(string $tenantId, string $submissionId, string $markerId, array $data): object
    {
        return TenantContext::withTenant($tenantId, function () use ($tenantId, $submissionId, $markerId, $data) {
            $sub = DB::selectOne(
                'SELECT s.id, s.assignment_id, s.user_id, a.course_id, a.title
                   FROM submissions s JOIN assignments a ON a.id = s.assignment_id
                  WHERE s.id = ?',
                [$submissionId]
            );
            if (! $sub) {
                throw new HttpException(404, 'Submission not found');
            }

            $workflow = $data['workflowState'] ?? 'complete';
            $grade = array_key_exists('grade', $data) ? $data['grade'] : null;

            $row = DB::selectOne(
                "UPDATE submissions
                    SET state = 'graded',
                        marker_id = ?,
                        workflow_state = ?,
                        grade = ?,
                        rubric_scores = ?,
                        feedback = ?,
                        updated_at = now()
                  WHERE id = ?
                  RETURNING id, state, workflow_state, marker_id, grade",
                [
                    $markerId, $workflow,
                    $grade,
                    isset($data['rubricScores']) ? json_encode($data['rubricScores']) : null,
                    isset($data['feedback']) ? json_encode($data['feedback']) : null,
                    $submissionId,
                ]
            );

            // Mirror the grade into the gradebook (grade_grades) when released,
            // so the student's /grades reflects assignment marks (audit §3.2 fix).
            if ($grade !== null && $workflow === 'released') {
                $this->gradebook->recordModuleGrade(
                    $tenantId, $sub->course_id, 'assignment', $sub->assignment_id,
                    $sub->title ?? 'Assignment', $sub->user_id, (float) $grade, 100.0, $markerId, 'assignment'
                );
            }

            return $row;
        });
    }

    public function listForAssignment(string $tenantId, string $assignmentId): array
    {
        return TenantContext::withTenant($tenantId, function () use ($assignmentId) {
            return DB::select(
                'SELECT s.id, s.user_id, u.email, s.state, s.workflow_state, s.is_late, s.submitted_at, s.grade
                   FROM submissions s JOIN users u ON u.id = s.user_id
                  WHERE s.assignment_id = ? ORDER BY s.submitted_at NULLS LAST',
                [$assignmentId]
            );
        });
    }

    public function mySubmission(string $tenantId, string $assignmentId, string $userId): ?object
    {
        return TenantContext::withTenant($tenantId, function () use ($assignmentId, $userId) {
            return DB::selectOne(
                'SELECT id, state, workflow_state, text_content, submitted_at, is_late, feedback
                   FROM submissions WHERE assignment_id = ? AND user_id = ? AND attempt_no = 1',
                [$assignmentId, $userId]
            );
        });
    }
}
