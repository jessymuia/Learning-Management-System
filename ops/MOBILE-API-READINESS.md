# Mobile App — API Readiness

**STATUS:** The API is mobile-ready; the native apps are a separate project (not built).

The REST API already supports everything a mobile client needs:

- **Token auth** — JWT bearer tokens work identically from native clients. The
  `/api/auth/login` → bearer-token flow is stateless and mobile-friendly.
- **JSON envelopes** — every endpoint returns `{data}` / `{error}`, easy to model
  in Swift/Kotlin.
- **Offline-capable reads** — course/content/grade reads are GETs that a mobile
  client can cache; completion can be queued and POSTed on reconnect (the
  completion + step endpoints are idempotent).
- **Push notifications** — the `notifications` table has a `channel` column;
  add a `push` channel + device-token registration endpoint when building the app.

## What the mobile project still needs (its own work)
- A native app (React Native / Flutter / Swift+Kotlin) — separate repo
- Device-token registration endpoint + APNs/FCM delivery in SendNotificationJob
- Offline sync conflict policy (last-write-wins is already how the API behaves)

No API redesign is required to support mobile.
