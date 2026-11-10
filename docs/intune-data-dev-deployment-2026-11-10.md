# Intune detail feeds: Dev, November 10, 2026

The user authorized adding the next Intune feeds and clarified that schema changes should
be made directly in the existing Dev database. The application database is `nso-audit-dev`
on `nso-audit-dev-257f10d8` in `NSO-Audit`; it is not a temporary test database.

Migration 019 was applied directly to Dev with the versioned migration runner and repeated
successfully to verify checksums. Seven new tables have 21 organization-isolation predicates
and enabled/trusted foreign keys. Existing audit history was preserved; no backfill or
application-table deletion was required.

A separate empty validation database was initially provisioned after Bicep compilation and
what-if showed only that database plus a temporary exact-IP operator rule. Following the
user's clarification it was removed without loading application data. The server database
list was verified as only `nso-audit-dev` and `master`. The optional isolated SQL fixture
suite was not executed; no such test success is claimed.

API deployment `073f9caa-150c-4c53-b098-2996d7e4c8d8` to `nso-audit-dev-api-flex` succeeded
and indexed the collector timer. Web deployment to `nso-audit-dev-web` succeeded. Existing
Dev configuration, managed identity, read permissions and the approved API-to-SQL subnet
were reused. No Graph grants, worker-IP firewall rules or platform redeployment were needed.

All 55 API tests passed, the production web build passed, and existing audit browser checks
passed locally and against `https://auditdev.newsommer.com` with synthetic intercepted API
responses. Those browser tests do not establish live customer authentication or source data.

## Real source run

Run `54e90cb1-7e00-4a30-aa7c-826f02ca7a4a` was queued through the application run helper for
the existing approved Dev tenant/subscription; the deployed worker performed the collection.
Created `2026-11-10T22:57:36.752Z`; collector version `tenant-data-v2-intune`.
Completed `2026-11-10T23:00:40.035Z` with all 24 datasets complete and 2,350 source records.
`verify-intune-dev.mjs --verify-evidence` confirmed setting counts against policy source
metadata, definitions on all 15 setting records, complete full-policy coverage, valid parent
links and timestamps. A different organization context could not read the new evidence.
The temporary operator rule `operator-intune-a019110a` was removed after verification.

| New dataset | Stored rows |
| --- | ---: |
| Settings catalog policies | 6 |
| Settings with definitions and nested values | 15 |
| Settings catalog assignments | 5 |
| Full device configuration properties | 1 |
| Device configuration assignments | 1 |
| Full compliance policy properties | 4 |
| Compliance policy assignments | 4 |

All seven new datasets reported complete. Counts are source records, not individual nested
settings or compliance findings. Group names remain unresolved IDs under the current approved
permission scope. Refer to [deployment and recovery](../database/intune-policy-details.md)
for API contracts and limitations. No claim of a clean Prod rebuild is made.
