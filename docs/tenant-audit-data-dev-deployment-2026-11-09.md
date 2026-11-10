# Unified tenant collection: Dev deployment, November 9, 2026

The user requested actual audit data collection, direct Dev schema updates, SQL as the audit
system of record and retirement of the Azure Tables runtime path. The storage account remains
for Functions host/timer coordination and other uses; no Azure resource was deleted.

## Deployment

- Existing Dev resource group: NSO-Audit.
- Existing SQL server/database: nso-audit-dev-257f10d8 / nso-audit-dev.
- Migration 018 applied at 2026-11-10T01:56:06.427Z (November 9 in America/Los_Angeles).
- Fifteen dedicated configuration/security tables added to the two existing licensing tables.
  Existing history and customer data were preserved; no backfill was fabricated.
- API deployed to nso-audit-dev-api-flex with Publish-NsoAuditApi.ps1; deployment identifier
  7c439fee-c69e-4362-9d75-c2d1d0f86f9e completed and indexed the timer and HTTP functions.
- Web deployed to nso-audit-dev-web with Publish-NsoAuditWeb.ps1 and Dev public configuration.
- Activated DATA_AUDITS_ENABLED=true and TENANT_STORE=sql through Set-NsoAuditSqlRuntime.ps1.
  infra/api-network.dev.bicepparam records the matching desired activation. No infrastructure
  redeployment, VNet/firewall changes, capacity changes or worker-IP rules were needed.
- The user explicitly approved adding and consenting to LicenseAssignment.Read.All and
  User.Read.All. Set-NsoAuditLicensePermissions.ps1 preserved existing requested permissions
  and added only the two Graph application-role grants for the existing Dev application.

## Real source collection

Created an authorized audit for the existing Dev tenant through the same SQL run-creation helper
used by the API. Initiator was the configured operator; the tenant-to-organization mapping and
subscription came from the existing approved Dev connection. This was not synthetic evidence.
The deployed timer obtained source credentials through its existing managed identity/Key Vault
configuration and collected from Microsoft Graph and ARM.

Audit: `4f2d6c13-d3bb-406a-8acf-7f1edc28b72d`.
Created: 2026-11-10T02:03:55.932Z.
Collection started: 2026-11-10T02:05:06.939Z.
Collection completed: 2026-11-10T02:06:08.952Z.
Final status: complete. All 17 configured datasets completed; 2,314 source records stored in SQL.

| Dataset | Stored rows |
| --- | ---: |
| Conditional Access | 8 |
| Named locations | 11 |
| Authentication methods root policy | 1 |
| Authentication registration | 10 |
| Authorization policy | 1 |
| Directory role assignments | 14 |
| Device configuration profiles | 1 |
| Device compliance policies | 4 |
| App protection policies | 0 (successful empty source response) |
| Microsoft Secure Score source history | 90 |
| Secure Score control profiles | 460 |
| Azure resource groups | 12 |
| Defender for Cloud scores | 1 |
| Defender for Cloud assessments | 95 |
| Defender assessment definitions | 1,583 |
| License inventory | 12 |
| User license assignment paths | 11 |

Counts are stored source records, not findings, unique users or validated recommendations.
Some tables are definitions or source history. Completion refers to these configured sources,
not the entire example-report catalog; unimplemented sections are listed in the runbook/UI.

## Verification

- Fifty API tests passed; production web build and workspace typechecks passed.
- Migration 018 SQL syntax and affected Bicep/environment parameters compiled.
- All fifteen new tables and their forty-five RLS predicates were verified in Dev.
- Real Conditional Access rows retain full conditions and collection/storage timestamps.
- A different organization session context could not read the real Conditional Access rows.
- An attempted terminal-job checkpoint was rejected with SQL error 51001; evidence remained intact.
- The applied migration checksum matches the source; repeat migration left the schema current.
- Deployed frontend browser checks passed with intercepted synthetic API responses, including
  unified tenant evidence, configuration JSON, dataset selection, licensing views, workspace
  selection, sign-in/out and viewer restrictions. This is separate from the real worker/SQL
  collection above; no real customer browser session was impersonated for the UI check.

No claim is made that all sources from the PDF, live authenticated HTTP launch, every recovery
scenario, or a clean Prod rebuild were verified. Existing scan history remains available in SQL.
Activation and rollback instructions are in [tenant audit data](../database/tenant-audit-data.md).
