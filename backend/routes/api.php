<?php

use App\Http\Controllers\Api\AvailabilityController;
use App\Http\Controllers\Api\CompletionController;
use App\Http\Controllers\Api\CredentialController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\NotificationPrefsController;
use App\Http\Controllers\Api\StructureController;
use App\Http\Controllers\Api\CalendarController;
use App\Http\Controllers\Api\EngagementController;
use App\Http\Controllers\Api\MessagingController;
use App\Http\Controllers\Api\XapiController;
use App\Http\Controllers\Api\AccountSecurityController;
use App\Http\Controllers\Api\CalendarExportController;
use App\Http\Controllers\Api\FileController;
use App\Http\Controllers\Api\PrivacyController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\ThemingController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\IntegrationSettingsController;
use App\Http\Controllers\Api\GraphQLController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AssignmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CommerceController;
use App\Http\Controllers\Api\ContentController;
use App\Http\Controllers\Api\CourseController;
use App\Http\Controllers\Api\TeacherController;
use App\Http\Controllers\Api\EnrolmentController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\ForumController;
use App\Http\Controllers\Api\GroupController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\GradebookController;
use App\Http\Controllers\Api\ProgramController;
use App\Http\Controllers\Api\ReportingController;
use App\Http\Controllers\Api\VideoController;
use App\Http\Controllers\Api\QuizController;
use App\Http\Controllers\Api\TenantController;
use App\Http\Controllers\Api\UserController;
use App\Http\Middleware\Authenticate;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json([
    'data' => ['name' => 'Production LMS API', 'version' => 'v1', 'status' => 'ok'],
]));

// ── Module 1 — auth (public) ──
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('ratelimit:10,60');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('ratelimit:20,60');
Route::post('/auth/operator-login', [AuthController::class, 'operatorLogin']);
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword']);
Route::post('/auth/refresh', [AuthController::class, 'refresh']);

// (tenant provisioning moved into the authenticated operator-guarded group below)

// public credential verification (no auth)
Route::get('/verify/{code}', [CredentialController::class, 'verify']);
Route::get('/branding/{slug}', [ThemingController::class, 'show']);

// M-Pesa Daraja callback — Safaricom POSTs STK results here (no auth; verified in handler)
Route::post('/payments/mpesa/callback', [CommerceController::class, 'mpesaCallback']);
Route::post('/payments/stripe/webhook', [CommerceController::class, 'stripeWebhook']);

// ── authenticated ──
Route::middleware(Authenticate::class)->group(function () {
    // Module 1
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/{id}', [UserController::class, 'show']);

    // Module 2 — tenants / categories / courses / enrolments / content
    Route::get('/tenants/me', [TenantController::class, 'current']);

    // ── Platform operator console (super-admin only) ──
    Route::post('/operator/tenants', [TenantController::class, 'provision'])->middleware('operator');
    Route::get('/operator/tenants', [TenantController::class, 'listAll'])->middleware('operator');
    Route::get('/operator/stats', [TenantController::class, 'platformStats'])->middleware('operator');
    Route::get('/operator/analytics', [TenantController::class, 'platformAnalytics'])->middleware('operator');
    Route::get('/operator/activity', [TenantController::class, 'platformActivity'])->middleware('operator');
    Route::patch('/operator/tenants/{tenantId}/status', [TenantController::class, 'setStatus'])->middleware('operator');
    Route::get('/operator/plans', [TenantController::class, 'plans'])->middleware('operator');
    Route::get('/operator/tenants/{tenantId}/subscription', [TenantController::class, 'subscription'])->middleware('operator');

    Route::get('/categories', [CategoryController::class, 'index']);
    Route::post('/categories', [CategoryController::class, 'store'])
        ->middleware('authorize:course.manage,tenant');

    Route::get('/courses', [CourseController::class, 'index']);
    // Teacher workspace — self-scoped to the teacher's assigned courses only
    Route::get('/teacher/courses', [TeacherController::class, 'myCourses']);
    Route::get('/teacher/overview', [TeacherController::class, 'overview']);
    Route::get('/teacher/students', [TeacherController::class, 'students']);
    Route::get('/courses/{id}', [CourseController::class, 'show']);
    Route::post('/courses', [CourseController::class, 'store'])
        ->middleware('authorize:course.manage,tenant');
    Route::patch('/courses/{id}', [CourseController::class, 'update'])
        ->middleware('authorize:course.manage,course:id');
    Route::delete('/courses/{id}', [CourseController::class, 'destroy'])
        ->middleware('authorize:course.manage,course:id');

    Route::get('/enrolments/mine', [EnrolmentController::class, 'mine']);
    // Student workspace — self-scoped to the student's own enrolments
    Route::get('/student/courses', [StudentController::class, 'myCourses']);
    Route::get('/student/overview', [StudentController::class, 'overview']);
    Route::get('/enrolments', [EnrolmentController::class, 'index']);
    Route::post('/enrolments', [EnrolmentController::class, 'store'])
        ->middleware('authorize:enrol.manage,tenant');
    Route::post('/enrolments/{id}/suspend', [EnrolmentController::class, 'suspend'])
        ->middleware('authorize:enrol.manage,tenant');

    Route::get('/content', [ContentController::class, 'index']);
    Route::post('/content', [ContentController::class, 'store'])
        ->middleware('authorize:course.manage,tenant');

    // ── Module 3 — gradebook ──
    Route::get('/grades/items', [GradebookController::class, 'listItems']);
    Route::post('/grades/items', [GradebookController::class, 'createItem'])
        ->middleware('authorize:grade.edit,tenant');
    Route::post('/grades/categories', [GradebookController::class, 'createCategory'])
        ->middleware('authorize:grade.edit,tenant');
    Route::get('/grades/mine', [GradebookController::class, 'myGrades']);
    Route::post('/grades', [GradebookController::class, 'setGrade'])
        ->middleware('authorize:grade.edit,tenant');
    Route::post('/grades/recompute', [GradebookController::class, 'recompute'])
        ->middleware('authorize:grade.edit,tenant');
    Route::get('/grades/summary', [GradebookController::class, 'summary']);

    // ── Module 3 — quiz engine ──
    Route::post('/questions', [QuizController::class, 'createQuestion'])
        ->middleware('authorize:quiz.manage,tenant');
    Route::post('/questions/{questionId}/versions', [QuizController::class, 'addQuestionVersion'])
        ->middleware('authorize:quiz.manage,tenant');
    Route::post('/quizzes', [QuizController::class, 'createQuiz'])
        ->middleware('authorize:quiz.manage,tenant');
    Route::post('/quizzes/{quizId}/slots', [QuizController::class, 'addSlot'])
        ->middleware('authorize:quiz.manage,tenant');
    Route::get('/quizzes/{quizId}/attempts', [QuizController::class, 'listAttempts']);
    Route::post('/quizzes/{quizId}/attempts', [QuizController::class, 'startAttempt']);
    Route::post('/attempts/{attemptId}/steps', [QuizController::class, 'recordStep']);
    Route::post('/attempts/{attemptId}/finish', [QuizController::class, 'finishAttempt']);

    // regrade (dry-run preview + apply) — version-pinned, spec §5.5
    Route::get('/quizzes/{quizId}/regrade/preview', [QuizController::class, 'regradePreview'])
        ->middleware('authorize:quiz.manage,tenant');
    Route::post('/quizzes/{quizId}/regrade/apply', [QuizController::class, 'regradeApply'])
        ->middleware('authorize:quiz.manage,tenant');

    // ── Module 3 — assignments + marking workflow ──
    Route::get('/assignments', [AssignmentController::class, 'listForCourse'])
        ->middleware('authorize:grade.edit,tenant');
    // students: list assignments for a course they can view (read-only, no grade.edit)
    Route::get('/courses/{courseId}/assignments', [AssignmentController::class, 'listForStudent'])
        ->middleware('authorize:course.view,course:courseId');
    Route::post('/assignments', [AssignmentController::class, 'create'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/assignments/{assignmentId}/submissions', [AssignmentController::class, 'listForAssignment'])
        ->middleware('authorize:grade.edit,tenant');
    Route::get('/assignments/{assignmentId}/submission', [AssignmentController::class, 'mySubmission']);
    Route::put('/assignments/{assignmentId}/submission', [AssignmentController::class, 'saveSubmission']);
    Route::post('/assignments/{assignmentId}/submit', [AssignmentController::class, 'submit']);
    Route::post('/submissions/{submissionId}/grade', [AssignmentController::class, 'grade'])
        ->middleware('authorize:grade.edit,tenant');

    // ── Module 4 — programs / nanodegrees ──
    Route::get('/programs', [ProgramController::class, 'index']);
    Route::post('/programs', [ProgramController::class, 'store'])
        ->middleware('authorize:course.manage,tenant');
    Route::post('/programs/{programId}/courses', [ProgramController::class, 'addCourse'])
        ->middleware('authorize:course.manage,tenant');
    Route::post('/programs/{programId}/enrolments', [ProgramController::class, 'enrol']);
    Route::post('/programs/{programId}/recompute', [ProgramController::class, 'recompute'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/programs/{programId}/progress', [ProgramController::class, 'progress']);

    // ── Module 4 — forums ──
    Route::get('/forums', [ForumController::class, 'listForums']);
    Route::post('/forums', [ForumController::class, 'createForum'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/forums/{forumId}/discussions', [ForumController::class, 'listDiscussions']);
    Route::post('/forums/{forumId}/discussions', [ForumController::class, 'startDiscussion']);
    Route::get('/discussions/{discussionId}/posts', [ForumController::class, 'listPosts']);
    Route::post('/discussions/{discussionId}/posts', [ForumController::class, 'reply']);

    // ── Module 4 — groups ──
    Route::get('/groups', [GroupController::class, 'index']);
    Route::post('/groups', [GroupController::class, 'store'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/groups/{groupId}/members', [GroupController::class, 'listMembers']);
    Route::post('/groups/{groupId}/members', [GroupController::class, 'addMember'])
        ->middleware('authorize:course.manage,tenant');

    // ── Module 5 — video sources (provider/gated decision) ──
    Route::post('/videos', [VideoController::class, 'attach'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/videos/{videoId}/playback', [VideoController::class, 'playback']);

    // ── Module 5 — commerce (orders / payments / invoices) ──
    Route::post('/orders', [CommerceController::class, 'createOrder']);
    Route::get('/orders/mine', [CommerceController::class, 'myOrders']);
    Route::get('/payments/report', [CommerceController::class, 'tenantOrders'])
        ->middleware('authorize:payment.view,tenant');
    Route::get('/orders/{orderId}', [CommerceController::class, 'getOrder']);
    // payment webhook target (provider signature verified in the handler in prod)
    Route::post('/orders/{orderId}/payments', [CommerceController::class, 'recordPayment']);

    // ── Module 5 — LTI 1.3 ──
    Route::get('/lti/registrations', [IntegrationController::class, 'listLti']);
    Route::post('/lti/registrations', [IntegrationController::class, 'registerLti'])
        ->middleware('authorize:course.manage,tenant');
    Route::post('/lti/registrations/{registrationId}/launch', [IntegrationController::class, 'beginLtiLaunch']);

    // ── Module 5 — SCORM ──
    Route::post('/scorm/packages', [IntegrationController::class, 'registerScorm'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/scorm/packages/{packageId}/tracks', [IntegrationController::class, 'getScormTracks']);
    Route::put('/scorm/packages/{packageId}/tracks', [IntegrationController::class, 'setScormTrack']);

    // ── Module 5 — webhooks ──
    Route::get('/webhooks', [IntegrationController::class, 'listWebhooks'])
        ->middleware('authorize:course.manage,tenant');
    Route::post('/webhooks', [IntegrationController::class, 'subscribeWebhook'])
        ->middleware('authorize:course.manage,tenant');

    // ── Module 6 — reporting / analytics ──
    Route::get('/reports/org', [ReportingController::class, 'orgOverview'])
        ->middleware('authorize:report.view,tenant');
    Route::get('/reports/teachers', [ReportingController::class, 'teacherActivity'])
        ->middleware('authorize:report.view,tenant');
    Route::get('/reports/activity', [ReportingController::class, 'orgActivity'])
        ->middleware('authorize:report.view,tenant');
    Route::get('/reports/trends', [ReportingController::class, 'trends'])
        ->middleware('authorize:report.view,tenant');
    Route::get('/reports/tenant', [ReportingController::class, 'tenantOverview'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/reports/courses/{courseId}', [ReportingController::class, 'courseOverview'])
        ->middleware('authorize:grade.view,tenant');
    Route::get('/reports/courses/{courseId}/at-risk', [ReportingController::class, 'atRisk'])
        ->middleware('authorize:grade.view,tenant');

    // ── Module 6 — control plane (metering, subscription, backups) ──
    Route::get('/admin/usage', [AdminController::class, 'usage'])
        ->middleware('authorize:course.manage,tenant');
    Route::post('/admin/usage', [AdminController::class, 'recordUsage'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/admin/subscription', [AdminController::class, 'subscription'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/admin/backups', [AdminController::class, 'listBackups'])
        ->middleware('authorize:course.manage,tenant');
    Route::post('/admin/backups', [AdminController::class, 'requestBackup'])
        ->middleware('authorize:course.manage,tenant');

    // ── Course structure (sections + modules) ──
    Route::get('/courses/{courseId}/sections', [StructureController::class, 'listSections']);
    Route::post('/courses/{courseId}/sections', [StructureController::class, 'createSection'])
        ->middleware('authorize:course.manage,course:courseId');
    Route::get('/courses/{courseId}/modules', [StructureController::class, 'listModules']);
    Route::post('/courses/{courseId}/modules', [StructureController::class, 'addModule'])
        ->middleware('authorize:course.manage,course:courseId');

    // ── Lessons (group activities within a section/unit) ──
    Route::get('/courses/{courseId}/lessons', [StructureController::class, 'listLessons']);
    Route::post('/courses/{courseId}/lessons', [StructureController::class, 'createLesson'])
        ->middleware('authorize:course.manage,course:courseId');

    // ── Completion tracking ──
    Route::post('/modules/{moduleId}/completion', [CompletionController::class, 'markActivity']);
    Route::get('/courses/{courseId}/completion', [CompletionController::class, 'courseStatus']);
    Route::get('/modules/{moduleId}/availability', [AvailabilityController::class, 'checkModule']);

    // ── Credentials ──
    Route::post('/credentials/definitions', [CredentialController::class, 'define'])
        ->middleware('authorize:course.manage,tenant');
    Route::post('/credentials/definitions/{definitionId}/issue', [CredentialController::class, 'issue'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/credentials/mine', [CredentialController::class, 'mine']);

    // ── Notifications ──
    Route::get('/notification-prefs', [NotificationPrefsController::class, 'show']);
    Route::put('/notification-prefs', [NotificationPrefsController::class, 'update']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);

    // ── Messaging ──
    Route::get('/conversations', [MessagingController::class, 'index']);
    Route::post('/conversations', [MessagingController::class, 'create']);
    Route::get('/conversations/{conversationId}/messages', [MessagingController::class, 'messages']);
    Route::post('/conversations/{conversationId}/messages', [MessagingController::class, 'send']);

    // ── Calendar ──
    Route::get('/calendar', [CalendarController::class, 'agenda']);
    Route::post('/calendar', [CalendarController::class, 'create']);

    // ── Engagement (choices / feedback) ──
    Route::post('/choices', [EngagementController::class, 'createChoice'])
        ->middleware('authorize:course.manage,tenant');
    Route::post('/choices/{choiceId}/respond', [EngagementController::class, 'respondChoice']);
    Route::get('/choices/{choiceId}/results', [EngagementController::class, 'choiceResults']);
    Route::post('/feedback/{formId}/responses', [EngagementController::class, 'submitFeedback']);

    // ── xAPI statement pipeline ──
    Route::post('/xapi/statements', [XapiController::class, 'store']);
    Route::get('/xapi/statements', [XapiController::class, 'recent'])
        ->middleware('authorize:course.manage,tenant');

    // ── Self-enrolment ──
    Route::post('/courses/{courseId}/self-enrol', [EnrolmentController::class, 'selfEnrol']);

    // ── Files (content-addressed, signed URLs) ──
    Route::post('/files', [FileController::class, 'register']);
    Route::get('/files/{fileId}/signed-url', [FileController::class, 'signedUrl']);

    // ── Privacy / GDPR ──
    Route::get('/privacy/export', [PrivacyController::class, 'exportMine']);
    Route::post('/privacy/erase', [PrivacyController::class, 'eraseMe']);
    Route::post('/privacy/consent', [PrivacyController::class, 'consent']);

    // ── Account security (MFA / TOTP) ──
    Route::post('/account/mfa/enable', [AccountSecurityController::class, 'enableMfa']);
    Route::post('/account/mfa/verify', [AccountSecurityController::class, 'verifyMfa']);

    // ── Calendar iCal export ──
    Route::get('/calendar/export.ics', [CalendarExportController::class, 'export']);

    // ── White-label theming ──
    Route::get('/branding', [ThemingController::class, 'mine']);
    Route::put('/branding', [ThemingController::class, 'update'])
        ->middleware('authorize:course.manage,tenant');

    // ── Announcements ──
    Route::get('/courses/{courseId}/announcements', [AnnouncementController::class, 'index']);
    Route::post('/courses/{courseId}/announcements', [AnnouncementController::class, 'post'])
        ->middleware('authorize:course.manage,course:courseId');

    // ── Groupings + group grading ──
    Route::post('/courses/{courseId}/groupings', [GroupController::class, 'createGrouping'])
        ->middleware('authorize:course.manage,course:courseId');
    Route::post('/groups/{groupId}/grade', [GroupController::class, 'gradeGroup'])
        ->middleware('authorize:course.manage,tenant');

    // ── Payment intent (provider-agnostic) ──
    Route::post('/orders/{orderId}/payment-intent', [CommerceController::class, 'createIntent']);
    Route::post('/orders/{orderId}/stripe-intent', [CommerceController::class, 'stripeIntent']);

    // ── LTI 1.3 OIDC launch handshake ──
    Route::post('/lti/registrations/{registrationId}/oidc', [IntegrationController::class, 'beginOidc']);
    Route::post('/lti/launch/verify', [IntegrationController::class, 'verifyLtiLaunch']);

    // ── GraphQL read gateway ──
    Route::post('/graphql', [GraphQLController::class, 'query']);

    // ── Quiz per-user overrides (extra time/attempts) ──
    Route::post('/quizzes/{quizId}/overrides', [QuizController::class, 'setOverride'])
        ->middleware('authorize:quiz.manage,tenant');

    // ── Forum ratings + moderation ──
    Route::post('/posts/{postId}/rate', [ForumController::class, 'ratePost']);
    Route::post('/posts/{postId}/answer', [ForumController::class, 'markAnswer'])
        ->middleware('authorize:course.manage,tenant');
    Route::patch('/discussions/{discussionId}/moderate', [ForumController::class, 'moderate'])
        ->middleware('authorize:course.manage,tenant');

    // ── Drag-drop reordering ──
    Route::patch('/sections/{sectionId}/visibility', [StructureController::class, 'setSectionVisibility'])
        ->middleware('authorize:course.manage,tenant');
    Route::patch('/sections/{sectionId}/modules/order', [StructureController::class, 'reorderModules'])
        ->middleware('authorize:course.manage,tenant');
    Route::patch('/courses/{courseId}/sections/order', [StructureController::class, 'reorderSections'])
        ->middleware('authorize:course.manage,course:courseId');

    // ── Role management (assign teacher/TA/manager/admin) ──
    Route::get('/settings/integrations', [IntegrationSettingsController::class, 'index'])
        ->middleware('authorize:course.manage,tenant');
    Route::put('/settings/integrations/{provider}', [IntegrationSettingsController::class, 'save'])
        ->middleware('authorize:course.manage,tenant');
    Route::get('/roles', [RoleController::class, 'index']);
    Route::get('/role-assignments', [RoleController::class, 'assignments']);
    Route::post('/role-assignments', [RoleController::class, 'assign'])
        ->middleware('authorize:course.manage,tenant');
    Route::delete('/role-assignments', [RoleController::class, 'revoke'])
        ->middleware('authorize:course.manage,tenant');

    // ── Program units (list units in a program, shows shared units) ──
    Route::get('/programs/{programId}/units', [ProgramController::class, 'units']);
});
