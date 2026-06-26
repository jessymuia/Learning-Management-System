<?php

namespace App\Http\Controllers\Api;

use App\Services\LtiService;
use App\Services\ScormService;
use App\Services\WebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class IntegrationController extends Controller
{
    public function __construct(
        private LtiService $lti,
        private ScormService $scorm,
        private WebhookService $webhooks
    ) {}

    // ── LTI ──
    public function listLti(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->lti->listRegistrations($request->attributes->get('tenantId'))]);
    }

    public function registerLti(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string',
            'role' => 'sometimes|in:consumer,provider',
            'issuer' => 'required|string',
            'clientId' => 'required|string',
            'deploymentId' => 'sometimes|string',
            'authEndpoint' => 'sometimes|url',
            'tokenEndpoint' => 'sometimes|url',
            'jwksUri' => 'sometimes|url',
            'config' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->lti->registerTool(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function beginLtiLaunch(Request $request, string $registrationId): JsonResponse
    {
        $data = $request->validate([
            'userId' => 'sometimes|uuid',
            'courseId' => 'sometimes|uuid',
            'moduleId' => 'sometimes|uuid',
            'messageType' => 'sometimes|string',
            'data' => 'sometimes|array',
        ]);

        return response()->json(['data' => $this->lti->beginLaunch(
            $request->attributes->get('tenantId'), $registrationId, $data
        )], 201);
    }

    // ── SCORM ──
    public function registerScorm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'courseId' => 'required|uuid',
            'title' => 'required|string',
            'version' => 'sometimes|in:1.2,2004',
            'manifest' => 'sometimes|array',
            'packageFileId' => 'sometimes|uuid',
        ]);

        return response()->json(['data' => $this->scorm->registerPackage(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function setScormTrack(Request $request, string $packageId): JsonResponse
    {
        $data = $request->validate([
            'scoId' => 'required|string',
            'element' => 'required|string',
            'value' => 'required',
        ]);

        return response()->json(['data' => $this->scorm->setTrack(
            $request->attributes->get('tenantId'), $packageId,
            $request->attributes->get('userId'), $data
        )]);
    }

    public function getScormTracks(Request $request, string $packageId): JsonResponse
    {
        return response()->json(['data' => $this->scorm->getTracks(
            $request->attributes->get('tenantId'), $packageId, $request->attributes->get('userId')
        )]);
    }

    // ── Webhooks ──
    public function listWebhooks(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->webhooks->listSubscriptions($request->attributes->get('tenantId'))]);
    }

    public function subscribeWebhook(Request $request): JsonResponse
    {
        $data = $request->validate([
            'url' => 'required|url',
            'events' => 'required|array|min:1',
            'secret' => 'sometimes|string',
        ]);

        return response()->json(['data' => $this->webhooks->subscribe(
            $request->attributes->get('tenantId'), $data
        )], 201);
    }

    public function beginOidc(Request $request, string $registrationId): JsonResponse
    {
        $data = $request->validate([
            'targetLinkUri' => 'required|url',
            'loginHint' => 'required|string',
        ]);

        return response()->json(['data' => $this->lti->beginOidcLaunch(
            $request->attributes->get('tenantId'), $registrationId,
            $data['targetLinkUri'], $data['loginHint']
        )]);
    }

    public function verifyLtiLaunch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'state' => 'required|string',
            'nonce' => 'required|string',
            'claims' => 'required|array',
        ]);

        return response()->json(['data' => $this->lti->verifyLaunch(
            $request->attributes->get('tenantId'), $data['state'], $data['nonce'], $data['claims']
        )]);
    }
}
