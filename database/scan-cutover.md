# Dev scan-data migration and SQL cutover

Scope: move the existing `tenants`, `scans` and `findings` entities to SQL and switch the current
API's storage implementation. This does not implement client password registration, management
screens, or change scanner permissions. Blob/queue/runtime Storage remains in use.

## Dev execution recorded 2026-10-19

- Migrated and reconciled **1 tenant registration, 11 scans and 130 findings**. Original IDs,
  timestamps, status, scores, baseline JSON and evidence were preserved. Source Tables were
  left unchanged. The approved organization mapping is in `dev-tenant-mapping.json`.
- Migrations 003/004 and the guarded runtime-principal repair were applied. The API package
  was deployed, the Function stopped for final reconciliation, the SQL cutover marker
  activated, and `TENANT_STORE=sql` plus explicit managed-identity SQL authentication set.
- After repairing runtime identity/network configuration, deployed `/api/health` returned
  HTTP 200 with `status: healthy` and `storage: sql`, proving runtime SQL access through its
  managed identity. Temporary migration access is removed after post-cutover verification.
- Read-contract comparison matched all 11 historical reports, bootstrap and scan history
  before and after cutover. Isolated write tests passed for evidence roundtrip, latest-scan
  updates, transactional rollback on duplicate findings and cross-organization access denial;
  fixtures were removed. Runtime-principal isolation and minimum-permission checks also passed.
- The initial cutover command's health window expired while runtime configuration was being
  repaired; it did not revert to stale Tables. Recovery was completed forward using SQL.
- A cached CLI login cannot acquire the frontend's delegated API scope. Automated validation
  does not claim an authenticated browser session or a new real customer scan. Verify an
  existing report through ordinary portal sign-in as the final user acceptance check.

## Preconditions and deployment order

1. Initialize SQL per `database/README.md`. Apply migrations through 004 with
   `node scripts/database.mjs migrate`; never edit an applied migration.
2. Approve the explicit source-tenant/customer mapping. `database/dev-tenant-mapping.json` maps
   only the known NewSommer Entra tenant to its Dev organization. Never reuse this mapping as
   a Prod customer registry. Unknown tenants stop the migration rather than get auto-assigned.
3. Grant the deployment operator temporary `Storage Table Data Reader` on the source account
   using `infra/migration-access.bicep`, after reviewing what-if. Retain the output assignment
   ID for removal. Add a temporary operator-IP SQL firewall rule as described in the SQL runbook.
   Use Entra credentials; no Storage keys, SQL passwords or entity exports are required.
4. Set these process environment values:
   `SQL_SERVER`, `SQL_DATABASE`, `SOURCE_STORAGE_ACCOUNT`, `STORAGE_ACCOUNT_NAME` (for contract
   comparison), and `TENANT_MAPPING_FILE`. Run:

   ```powershell
   node scripts/migrate-table-data.mjs inspect
   node scripts/migrate-table-data.mjs copy
   node scripts/migrate-table-data.mjs verify
   npm run build --workspace '@nso-audit/api'
   node scripts/verify-sql-scan-store.mjs
   $env:CONFIRM_DEV_WRITE_TEST = 'yes'
   node scripts/verify-sql-writes.mjs
   ```

   Copy is repeatable before activation. It is one SQL transaction and compares every source
   entity's full contents, not just counts. Foreign keys reject orphan findings; unexpected
   source keys, conflicting tenant mappings, and reconciliation differences fail closed. It
   never modifies source Tables. Runtime contract comparison checks bootstrap, history,
   findings, baseline, timestamps and scores; logs do not print evidence. Write tests use
   isolated temporary organizations and remove them afterward.
5. Run application type checks/tests and migration-model tests. Deploy the staged API using
   `Publish-NsoAuditApi.ps1` with explicit subscription/group/function and optional
   `PackageOutputPath` under ignored `.azure/releases/`. Existing storage remains selected
   until the environment is explicitly configured. The API's health response should now show
   `storage: tables`; validate this before the cutover.
6. Run `Complete-NsoAuditSqlCutover.ps1` with explicit Dev targets, mapping, source account and
   management tenant. It briefly stops the Function, confirms stopped state, performs a final
   copy and exact verification, sets the SQL cutover marker, configures `TENANT_STORE=sql`
   and SQL metadata through `Set-NsoAuditSqlRuntime.ps1`, and restarts the Function.
   Its final HTTP health check verifies that the deployed runtime can connect to SQL and
   read the activated storage marker. SQL selection never silently falls back to Tables.
7. Re-run the read-only contract comparison, open existing report links in the portal, and
   test a new assessment when an authorized operator is ready. The existing Entra `/me`
   authorization model is preserved as a transitional path; new client membership-based
   routes must be implemented separately. The source copy does not turn tenant consent into
   operator authorization across customer workspaces.
8. Delete the specific temporary read-role assignment (`az role assignment delete --ids <id>`)
   and temporary SQL operator firewall rule. Keep the approved API subnet rule. Preserve source
   Tables as the pre-cutover snapshot; no decommission/deletion is part of this release.

## Failure and rollback

- Before activation, failed import/verification rolls back SQL changes and leaves source Tables
  untouched. The cutover script restarts the staged Tables API if failure occurred before the
  activation attempt.
- Once activation is attempted, uncertainty must not restart an app against stale Tables. The
  script leaves the Function stopped if it cannot confirm SQL runtime configuration. Inspect
  `dbo.ScanStorageCutover` and repair configuration before restarting.
- Once SQL is active, source replay is prohibited by the migration tool. Do not use the old
  Tables backend as a fallback: new SQL scans would be missing there. Prefer a forward fix or
  restore SQL to a separate database; any rollback to Tables requires a reviewed reverse
  reconciliation of post-cutover writes. Retain the deployed release package for diagnostics.
- Application health proves runtime database connectivity, not a completed browser sign-in or
  assessment run. Record the scope of validation accurately.

## Data representation

`security.EntraConnections` contains the explicitly approved tenant/organization mapping.
`app.TenantRegistrations`, `app.ScanRuns` and `app.ScanFindings` have organization-scoped keys,
foreign keys and row-level security. A persisted scan timestamp supports indexed history.
The full entity JSON preserves evolving historical evidence and baseline schemas without
recomputing scores. New findings are not subject to the old Table property truncation limit.
Previously truncated source evidence cannot be recovered by this migration.

This moves structured scan records, not files or Function runtime storage. It does not claim
the older full platform Bicep is reconciled or that Prod clean deployment has been proven.

## Deployment lessons incorporated in code

- Windows PowerShell's default ZIP helper emitted backslash entry names. The publisher now
  explicitly creates forward-slash entries, loads both compression assemblies and validates
  required Function paths before deployment. Health must confirm the staged code is running.
- SQL runtime bootstrap now uses the managed identity's application/client ID for the external
  user's SID. The object-ID bootstrap used in the initial Dev foundation required an explicit,
  guarded runtime-user repair; its restricted role and customer data were preserved.
- Cloud SQL authentication explicitly selects managed identity; local tooling uses Azure CLI
  rather than whichever cached developer identity a default chain happens to select.
- Linux Consumption's actual worker egress included an address absent from ARM's reported
  outbound addresses. The observed address was recorded in historical Dev SQL parameters.
  Do not infer a stable network boundary from that list. Before Prod, select supported
  VNet/private connectivity or stable egress (including an appropriate Functions hosting plan).
  This historical workaround is superseded by the 2026-10-20 VNet/Flex migration; do not add
  further worker IPs. See `../docs/networking-requirements.md` and the deployment runbook.
