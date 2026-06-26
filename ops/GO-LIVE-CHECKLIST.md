# Go-Live Commissioning Checklist

These items **cannot be completed in code** — they require external parties or
real infrastructure. This is exactly what to commission, and from whom.

## Requires external parties (humans)
| Item | Who to engage | Deliverable you need |
|---|---|---|
| **Penetration test** | A security firm (e.g. CREST-certified) | Pen-test report + remediation sign-off against the deployed app |
| **WCAG 2.2 AA audit** | An accessibility auditor | VPAT / audit report certifying AA conformance |
| **Data-protection review** | A privacy lawyer (GDPR + Kenya DPA 2019) | DPIA + sign-off on retention/erasure/consent flows |
| **Trademark / white-label review** | IP counsel | Clearance for tenant white-label branding |

## Requires running infrastructure (code is ready; run it on your infra)
| Item | Enabler we built | How to execute |
|---|---|---|
| **DR restore rehearsal** | `ops/dr-backup-restore.sh` | Schedule backups; rehearse `restore` quarterly; record RTO/RPO |
| **Load + scale testing** | `ops/load-test.js` (k6) | `k6 run -e BASE_URL=... -e TOKEN=... ops/load-test.js` against staging |
| **OpenSearch search** | `SearchIndexService` (SQL fallback now) | Stand up OpenSearch; set `OPENSEARCH_HOST`; backfill indices |
| **Citus sharding** | Schema already keyed by `tenant_id` | Deploy Citus; `SELECT create_distributed_table(...)` per table |
| **Mobile apps** | `ops/MOBILE-API-READINESS.md` | Build native app in a separate repo against the existing API |

## Before flipping to production
- [ ] Run `docker compose up` and confirm the full stack boots end-to-end
- [ ] `composer install` + `./vendor/bin/phpunit` — confirm the test suite passes in your env
- [ ] Set real secrets (JWT_SECRET, DB creds, provider keys) via your secrets manager
- [ ] Configure provider credentials (Stripe, M-Pesa/Daraja, IdP metadata for SSO/LTI)
- [ ] Point DNS + TLS; enable rate limiting at the edge as well as the app
