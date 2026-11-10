# Unified tenant audit data in SQL

Dev migration, activation and a real completed source run are recorded in the
[November 9 deployment verification](../docs/tenant-audit-data-dev-deployment-2026-11-09.md).

Migration 018 extends the run/queue foundation from migration 017; 019 adds linked Intune details.
`Run audit` creates a SQL run immediately and queues 24 datasets under one ScanId. No questionnaire,
documents, comparisons or grouping UI is required. Existing historical scorecards stay readable.

## Datasets and tables

Collector v2 adds seven Intune datasets (24 total) after migration 019. See
[Intune policy details](intune-policy-details.md) for settings catalog policies,
settings/definitions, assignments and full device configuration/compliance properties.
Historical v1 audits retain their original 17-dataset scope without fabricated backfill.

| Dataset | SQL table |
| --- | --- |
| Conditional Access policies | app.AuditConditionalAccessPolicies |
| Named locations | app.AuditNamedLocations |
| Authentication methods policy | app.AuditAuthenticationMethods |
| User authentication registration | app.AuditAuthenticationRegistrations |
| Authorization policy | app.AuditAuthorizationPolicies |
| Directory role assignments | app.AuditRoleAssignments |
| Device configuration profiles | app.AuditDeviceConfigurations |
| Compliance policies | app.AuditCompliancePolicies |
| App protection policies | app.AuditAppProtectionPolicies |
| Microsoft Secure Score source records | app.AuditMicrosoftSecureScores |
| Secure Score control profiles | app.AuditSecureScoreProfiles |
| Azure resource groups | app.AuditResourceGroups |
| Defender for Cloud scores | app.AuditDefenderCloudScores |
| Defender for Cloud assessments | app.AuditDefenderRecommendations |
| Defender assessment definitions | app.AuditDefenderAssessmentMetadata |
| License inventory | app.AuditLicenses |
| User license assignment paths | app.AuditLicenseAssignments |

Each table is scoped by OrganizationId, TenantId and ScanId. New configuration tables retain
the stable source identifier, queryable name/state, available source timestamps, sanitized full
source JSON, CollectedAtUtc and StoredAtUtc. Policy conditions, inclusions/exclusions, controls
and nested settings in the selected API response are retained; display summaries do not truncate
the stored evidence. Common credential fields are redacted recursively while retaining policy
settings such as passwordRequired. AuthenticationMethods stores the root policy and its returned
configuration; it does not claim per-user authentication secrets or credentials.

All new app tables have organization RLS predicates and tenant/audit foreign keys. The existing
leased SQL jobs dispatch dataset pages. Each page and its continuation cursor commit together;
lease checks reject stale workers and terminal-job writes. Interruption resumes the committed
cursor. A later source failure retains earlier evidence and marks the dataset partial. Empty
success, missing access and failed collection remain distinguishable.

The scope/category catalog is versioned in apps/api/src/audits/catalog.ts. Table names and API
origins/paths are static allowlists. ARM collection verifies the supplied subscription belongs to
the audit tenant before retrieving its evidence. Paging cannot switch origin, path or subscription.
No customer-supplied URL or table name is accepted. Graph/ARM paging is followed, rather than
saving only the first response or the scorecard's top 25 recommendations.

## SQL is the sole audit backend

The API no longer imports the legacy Azure Tables store at runtime. TENANT_STORE must be sql;
there is no fallback to old data when SQL fails. Legacy Table code remains available to historical
migration/verification tooling, not normal requests. The storage account is retained for other
uses and Azure Functions host/timer coordination. No new audit evidence is stored in Tables or
Blobs. Do not delete the host storage account or its managed-identity access.

## Flow and API

- With DATA_AUDITS_ENABLED=true, POST /api/me/scans accepts subscriptionId, resolves the
  authorized tenant and creates the queued SQL run, collections and jobs atomically (HTTP 202).
- The minute timer collects pages independently for each dataset. Main audit collection and
  licensing use the same run identifier. The flag gates the rollout; turning it off stops new
  typed dispatch and restores the existing SQL-backed starter collector.
- GET /api/me/scans/{id} remains compatible with existing history and identifies tenant scopes.
- GET /api/me/audits/{id} returns run metadata plus dataset statuses, counts and category labels.
- GET /api/me/audits/{id}/{dataType} returns paginated, tenant-scoped saved evidence with search.
- New tenant runs open the SQL evidence review instead of presenting an uncomputed scorecard.
  Users select a dataset and inspect the stored source configuration and collection timestamps.

## Permissions and remaining coverage

Existing Graph permissions cover the established identity/Intune/score sources; missing access
to any specific source is reported for that dataset. Licensing requires LicenseAssignment.Read.All
and User.Read.All. Use the additive `Set-NsoAuditLicensePermissions.ps1`: -WhatIf previews the
two requested roles; -GrantConsent explicitly adds only those two app-role grants for the selected
tenant. Existing requested permissions and consent grants are preserved. Do not use a replacement
manifest script merely to add licensing. Tenant-wide consent requires the authorized administrator's
approval. API workers never grant their own permissions.

This is not yet the full example-report catalog. DLP, labels/publishing, retention, insider risk,
threat/alert policies, Sentinel connectors, backup policies,
Exposure Score and Secure Score for Devices are not collected by this version. Device compliance
and configuration inventory rows retain their original source response; migration 019 adds
separately fetched properties and assignments as linked child datasets. Control profiles are source evidence, not a new validated
recommendation ranking or framework assessment. A completed run means its configured datasets
finished successfully, not that all future modules or compliance criteria were covered.

## Deployment and recovery

1. Run workspace typechecks, API tests and web/browser checks. Validate migration SQL syntax,
   and compile the affected Bicep and environment parameter file. Compilation is not a verified
   clean deployment. Inspect what-if before any infrastructure apply; no resource deployment
   is required for these application changes.
2. Apply through 019 with the versioned migration runner before this API. Dev is NSO-Audit; the user
   explicitly requested direct Dev migrations. Preserve applied checksums and existing history.
   No data backfill is needed; do not misrepresent old findings as newly collected source data.
3. Deploy API and web with the rollout flag off. Configure approved permissions/consent using
   the versioned additive script. Source failures must not block permitted datasets.
4. Activate via Set-NsoAuditSqlRuntime.ps1 using explicit Dev target, SQL, management identity
   parameters, -TenantStore sql and -DataAuditsEnabled true. The Dev Bicep parameter records
   that desired setting; future Prod must have its own configuration/identities/consent.
5. Start a real authorized audit. Verify run and dataset rows, timestamps, status and counts in
   SQL, compare representative source records, and check the deployed UI. Verify foreign-context
   reads fail closed. A mocked browser pass alone does not prove collection.

Recovery: turn the flag off with the same versioned runtime script, preserve tables and snapshots,
and deploy a known-good API/web if necessary. There is no destructive down migration. A prior
API can read old scorecards but will not render new tenant data runs; reopen an earlier report.
Do not restore old Azure Tables as a live backend. Application access to SQL remains through the
approved subnet; operator access remains temporary and exact-IP. No worker IP allowlist is added.
