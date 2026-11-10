# Database-backed license audits

The first data-audit milestone collects tenant license inventory and user assignment paths.
It does not implement the remaining report datasets, audit comparison, questions, documents,
to-dos or scoring changes. Existing starter scans remain readable and unchanged.

## Storage and behavior

Migration `017_audit_licensing.sql` adds:

- `app.DataAudits`: typed run status, initiator, collector version and UTC lifecycle timestamps;
  references the existing `app.ScanRuns` identifier so scan history remains shared.
- `app.AuditCollections`: independent status, count, timestamps and safe failure code for
  `licenses` and `licenseAssignments`.
- `app.AuditLicenses`: one row per source subscribed-SKU object per audit, including SKU,
  enabled/suspended/warning units, consumed units, capability status and applies-to scope.
- `app.AuditLicenseAssignments`: user/SKU/assignment-source rows. Direct and each group path
  remain distinct; unknown metadata stays unknown. Retains assignment state, error, disabled
  plans, source update time, collection time and storage time.
- `dbo.AuditCollectionJobs`: private dispatch metadata and paging checkpoints, accessible to
  runtime only through narrow security procedures. No credentials or evidence payloads.

Every evidence row includes OrganizationId, TenantId and ScanId. RLS covers all new app tables.
Assignments can be saved when inventory collection fails; there is deliberately no FK to a
potentially unavailable SKU inventory dataset. UI drill-down matches SKU within the same audit.
Assignment-path counts are not unique-user counts or consumed-license totals. Enabled units
are shown explicitly rather than conflating enabled, suspended and warning capacity.

Friendly product names are currently unavailable from these source responses, so the UI uses
skuPartNumber, then skuId. No external name catalog is fetched. License data does not claim
policy category membership; the planned five category mappings apply to later policy collectors.

## Source access

Read-only application calls use Microsoft Graph v1.0 `/subscribedSkus` and `/users` with a
limited `$select` for IDs, names/email, assignedLicenses and licenseAssignmentStates. No Azure
subscription or Azure RBAC is required for this milestone. Public-cloud Graph is currently
supported; sovereign-cloud endpoints are not configured by this slice.

Use `Set-NsoAuditApiPermissions.ps1 -IncludeLicenseInventory` alongside the explicitly desired
existing module switches. This adds `LicenseAssignment.Read.All` for inventory and `User.Read.All`
for the user collection and nonbasic licensing properties. The script replaces the complete
permission manifest: preview it with `-WhatIf` and retain existing selected module switches.
Customer administrators must review and grant consent separately; this code does not grant it.

References: [subscribed SKUs](https://learn.microsoft.com/en-us/graph/api/subscribedsku-list?view=graph-rest-1.0),
[list users](https://learn.microsoft.com/en-us/graph/api/user-list?view=graph-rest-1.0),
[assignment states](https://learn.microsoft.com/en-us/graph/api/resources/licenseassignmentstate?view=graph-rest-1.0).

## Collection and recovery

`POST /api/me/audits` resolves authorized tenant membership and atomically creates a queued run,
two dataset results and two jobs, returning HTTP 202 with ScanId. The newest run is immediately
visible in existing scan history. Viewer accounts cannot start runs.

The `collectAuditData` timer dispatches jobs every minute. A five-minute lease and an opaque
lease identifier fence stale workers. Each invocation processes bounded work; each source page
is committed with its next link in the same SQL transaction. Closing the browser has no effect.
A worker interruption resumes from the last committed page after lease expiry. Successful pages
reset interruption attempts; repeated interruption eventually records `workerInterrupted`.

Source requests have a timeout, bounded throttling/server retries, and validated same-host,
same-endpoint paging links. Successful empty datasets, missing access, failed requests and
partial evidence have separate statuses. Already saved pages survive a later source failure.
A terminal source failure ends that dataset; start a new audit to retry collection. Graph is
not transactional across pages, so collection timestamps identify the observation window rather
than claiming one atomic Microsoft-side snapshot.

The API and timer fail closed unless `TENANT_STORE=sql`, verified SQL cutover is active, and
`DATA_AUDITS_ENABLED=true`. Default is disabled. The API host now includes the Functions v4
extension bundle for the timer. Existing host-storage managed identity and Blob Data Owner
access provide timer lease storage; verify those existing assignments on the target host.

## Deployment order and validation

Local checks:

```powershell
npm run typecheck
npm test --workspace @nso-audit/api
npm run build --workspace @nso-audit/web
node scripts/test-audit-data-ui.mjs
```

The browser check uses intercepted synthetic API responses, Edge on Windows and Playwright
Chromium elsewhere (`npx playwright install chromium` if needed). The web deployment workflow
runs it before publishing. It checks launch, progress, drill-down, search, missing access,
route restoration, viewer controls and mobile layout; it does not contact Azure.

For real SQL verification, initialize a disposable database named `nso-audit-validation-*`
through migration 017, with no tenant connections or jobs. Point SQL_SERVER/SQL_DATABASE at
that database, set CONFIRM_DISPOSABLE_AUDIT_TEST to its exact database name, build the API,
then run `node scripts/verify-audit-licensing.mjs`. It uses synthetic fixtures and removes them
in finally. It temporarily selects SQL cutover within that empty validation database and
restores the prior backend afterward. Never attach an application host to this database.
This is an operator-run integration test, separate from unit/browser tests; it requires an
authenticated SQL migration administrator and approved temporary exact-IP operator access.

1. Run API tests, workspace typechecks and web build. Compile the affected Bicep and parameter
   file. Inspect infrastructure what-if before any infrastructure apply; do not redeploy legacy
   unreconciled platform templates. No new Azure resource is required for this slice.
2. Validate migrations through 017 in a disposable database using the versioned migration runner.
   Re-run migration to verify checksum/idempotence. Perform the persistence, lease and isolation
   checks below there before applying Dev. Use synthetic data only.
3. Back up/review recovery for Dev, then apply migration 017 through `node scripts/database.mjs
   migrate --through=017_audit_licensing.sql`. Existing JSON scans need no backfill; do not invent
   license snapshots for historical runs that never collected them.
4. Deploy API and web with data audits disabled. Configure and verify licensing permissions and
   customer consent. Preserve names and the approved API-to-SQL VNet path.
5. Activate through `Set-NsoAuditSqlRuntime.ps1` with existing target/SQL/management parameters,
   `-TenantStore sql -DataAuditsEnabled true`. Record the matching environment parameter
   `dataAuditsEnabled=true` once activation is validated. Never copy Dev identities or data to Prod.
6. Open **Audit data and licenses** from setup or a report (`/audit-data`). Start a run. Verify
   immediate queued history, timer pickup, terminal dataset statuses, paging, license-to-user
   drill-down and search. Close/reopen during collection. Check counts against source responses.

Before claiming a clean deployment, exercise real SQL: foreign-tenant reads/writes are denied;
source-page data and cursor roll back together on failure; a stale lease cannot commit; retries
do not duplicate rows; two audits retain independent snapshots; zero data differs from denied
access; one failed dataset preserves its successful sibling; terminal snapshots reject further
worker writes. Verify API denial for unauthenticated users and viewer writes. Build/syntax checks
and mocked browser tests alone do not establish those database/live-service properties.

## Rollback

Disable `DATA_AUDITS_ENABLED` first using the same versioned runtime script and update the
environment parameter accordingly. The timer stops claiming work and new data-audit requests
return 503; in-flight work may finish its current page. Preserve the additive tables and all
snapshots. Redeploy prior API/web if needed; old code ignores the extra metadata. Its legacy report
view may show no findings for a licensing-only run, so reopen a known prior starter scan.
Do not drop tables, modify applied migration checksums or restore over customer data merely
to hide the feature. After repair, re-enable and verify expired-lease recovery; use a new audit
for terminal source failures.
