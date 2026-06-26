<?php

namespace App\Http\Controllers\Api;

use App\Services\CourseAccessService;
use App\Services\QuizService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QuizController extends Controller
{
    public function __construct(
        private QuizService $quiz,
        private \App\Services\RegradeService $regrade,
        private \App\Services\QuizOverrideService $overrides
    ) {}

    public function createQuestion(Request $request): JsonResponse
    {
        $data = $request->validate([
            'categoryId' => 'required|uuid',
            'qtype' => 'required|in:mcq,multichoice,truefalse,matching,shortanswer,numerical,essay,selectmissing,draganddrop,cloze,calculated',
            'questiontext' => 'required|string',
            'defaultmark' => 'sometimes|numeric',
            'data' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->quiz->createQuestion(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function createCategory(Request $request): JsonResponse
    {
        $data = $request->validate(['courseId' => 'required|uuid', 'name' => 'required|string']);
        return response()->json(['data' => $this->quiz->createCategory(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function listCategories(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->quiz->listCategories(
            $request->attributes->get('tenantId'), $request->query('courseId')
        )]);
    }

    public function addQuestionVersion(Request $request, string $questionId): JsonResponse
    {
        $data = $request->validate([
            'questiontext' => 'sometimes|string',
            'defaultmark' => 'sometimes|numeric',
            'data' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->quiz->addQuestionVersion(
            $request->attributes->get('tenantId'), $questionId, $data
        )], 201);
    }

    public function createQuiz(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'name' => 'required|string',
            'intro' => 'sometimes|array',
            'openAt' => 'sometimes|date',
            'closeAt' => 'sometimes|date',
            'timeLimitS' => 'sometimes|integer|min:1',
            'attemptsAllowed' => 'sometimes|integer|min:0',
            'gradeMethod' => 'sometimes|in:highest,average,first,last',
            'navigation' => 'sometimes|in:free,sequential',
            'behaviour' => 'sometimes|in:deferred,immediate,adaptive',
            'shuffle' => 'sometimes|boolean',
            'gracePeriodS' => 'sometimes|integer|min:0',
        ]);

        return response()->json(['data' => $this->quiz->createQuiz(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function addSlot(Request $request, string $quizId): JsonResponse
    {
        $data = $request->validate([
            'questionId' => 'required|uuid',
            'maxmark' => 'sometimes|numeric',
        ]);

        return response()->json(['data' => $this->quiz->addSlot(
            $request->attributes->get('tenantId'), $quizId, $data
        )], 201);
    }

    public function startAttempt(Request $request, string $quizId): JsonResponse
    {
        $this->access->assertQuizAccess($request->attributes->get('tenantId'), $quizId, $request->attributes->get('userId'));
        return response()->json(['data' => $this->quiz->startAttempt(
            $request->attributes->get('tenantId'), $quizId, $request->attributes->get('userId')
        )], 201);
    }

    public function recordStep(Request $request, string $attemptId): JsonResponse
    {
        $data = $request->validate([
            'questionVersionId' => 'required|uuid',
            'slotNum' => 'required|integer',
            'action' => 'required|in:autosave,submit,comment,regrade,manualgrade',
            'state' => 'required|string',
            'response' => 'sometimes|array',
            'fraction' => 'sometimes|numeric',
        ]);

        return response()->json(['data' => $this->quiz->recordStep(
            $request->attributes->get('tenantId'), $attemptId, $data
        )], 201);
    }

    public function finishAttempt(Request $request, string $attemptId): JsonResponse
    {
        return response()->json(['data' => $this->quiz->finishAttempt(
            $request->attributes->get('tenantId'), $attemptId
        )]);
    }

    public function listAttempts(Request $request, string $quizId): JsonResponse
    {
        $this->access->assertQuizAccess($request->attributes->get('tenantId'), $quizId, $request->attributes->get('userId'));
        return response()->json(['data' => $this->quiz->listAttempts(
            $request->attributes->get('tenantId'), $quizId, $request->attributes->get('userId')
        )]);
    }

    public function regradePreview(Request $request, string $quizId): JsonResponse
    {
        return response()->json(['data' => $this->regrade->regradeQuiz(
            $request->attributes->get('tenantId'), $quizId, false
        )]);
    }

    public function regradeApply(Request $request, string $quizId): JsonResponse
    {
        return response()->json(['data' => $this->regrade->regradeQuiz(
            $request->attributes->get('tenantId'), $quizId, true
        )]);
    }

    public function setOverride(Request $request, string $quizId): JsonResponse
    {
        $data = $request->validate([
            'userId' => 'sometimes|uuid',
            'groupId' => 'sometimes|uuid',
            'openAt' => 'sometimes|date',
            'closeAt' => 'sometimes|date',
            'timeLimitS' => 'sometimes|integer|min:0',
            'attemptsAllowed' => 'sometimes|integer|min:0',
        ]);

        return response()->json(['data' => $this->overrides->setOverride(
            $request->attributes->get('tenantId'), $quizId, $data
        )], 201);
    }
}
