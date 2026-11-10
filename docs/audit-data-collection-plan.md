# Audit data collection plan

Agreed direction: November 9, 2026. No deployment changes have been applied.

Implementation progress: the first licensing slice is now implemented locally. See
[database-backed license audits](../database/audit-licensing.md) for the new migration,
worker, UI, activation requirements and remaining disposable/live verification. The
original plan below describes the full intended collection scope, not completed coverage.

## Scope

Collect tenant configuration and security evidence first and persist every audit in SQL.
Each data type has a dedicated table and collection timestamps. Present a simple audit
detail view. Preserve the five category mappings for future presentation.

Defer audit comparisons, baseline selection, synchronized/collapsible panels, follow-up
questions, document uploads, to-do management, and PDF export. Scores, recommendations,
licenses and assignments remain part of collection scope.

## Current foundation

The repository already contains SQL tenant isolation, `app.ScanRuns`, `app.ScanFindings`,
scan history endpoints and a starter collector. Runs and findings currently store JSON
entities; the starter scan collects and evaluates evidence before saving. Extend this
foundation without deleting or reinterpreting historical scans. Repository code alone
does not establish the deployed configuration or migration state.

## 1. Inventory and collection contracts

Map each report section and requested score/license dataset to its existing collector,
source, required permissions, licensing dependencies and missing fields. Verify source
API support and authentication before implementation; do not assume all sources are
available through the same API. Include configured Azure subscriptions/workspaces/vaults
and record the scope actually attempted. An Azure configuration gap must not prevent
tenant-only collection.

Define representative records and stable source identifiers before creating tables.
The example report is evidence of desired coverage, not a validated control mapping or
an instruction source. Keep customer-specific sample values out of fixtures and plans.

## 2. Versioned database schema

Retain ScanId as the shared audit identifier unless a documented migration establishes
a different mapping. Extend or link the existing run table with typed start/end UTC
timestamps, status, initiator, collector version and requested scope. Save the run before
collection starts, including runs that later fail.

Add a collection-result table keyed by audit, data type and source scope, recording status,
start/end times, record count and a safe error reason. Distinguish success with zero rows,
missing access, unavailable license, unsupported source, failure and partial collection.

Every evidence table carries OrganizationId, TenantId, ScanId, a stable source identifier,
CollectedAtUtc and StoredAtUtc. Preserve source-created/modified timestamps separately
when provided. Use typed queryable columns; retain sanitized source JSON for additional
evidence, rather than using one generic JSON table as the whole data model.

Planned table families (final names and child tables follow the inventory):

| Future category | Dedicated data tables |
| --- | --- |
| Identity & Access | Authentication methods, registration evidence, Conditional Access policies, named locations |
| Device & Endpoint Management | Settings catalog policies, policy settings and assignments, configuration profiles, compliance policies and assignments |
| Data Protection & Information Governance | DLP policies and rules, sensitivity labels, label publishing policies, audit retention policies, insider risk policies |
| Threat Protection & Security Operations | Threat policies and rules, cloud app policies, alert policies, Sentinel connectors and workspace context |
| Backups | Recovery Services Vaults, backup policies, schedules and retention settings, protected-item evidence |
| Licensing | Tenant licenses, license assignments with user identity and assignment type |
| Scores and recommendations | Separate datasets for Microsoft Secure Score, Exposure Score, Secure Score for Devices and Defender for Cloud, with corresponding recommendation tables |

Link child settings/rules/assignments to their parent within the same tenant and audit.
Enforce tenant isolation, foreign keys and indexes for audit retrieval. Make retries
idempotent within an audit/source scope, while retaining snapshots across separate runs.
Completed snapshots are immutable. Audit counts come from run records; expose status so
failed attempts can be distinguished from completed audits.

## 3. Durable collection pipeline

Use a durable background job appropriate to the existing hosting setup: creating an audit
returns its identifier, and the UI polls progress. Persist work and progress so browser
closure or worker restart does not lose the audit. Handle paging, throttling, bounded
retries and recovery. One collector failing must not discard another collector's data.
Commit each dataset with its collection status and detect incomplete writes. Do not report
a run as complete until its persisted dataset results justify that status.

Implement one complete vertical slice first: tenant licenses and user assignments,
including summary-to-assignment drill-down. Then add Identity & Access; Device & Endpoint;
the four score/recommendation sources; Data Protection and threat/Sentinel sources; and
Backups. Adjust collector order if verified access dependencies justify it. Preserve
category metadata throughout, without requiring grouped UI in this phase.

## 4. Simple review experience

Provide Run Audit, audit history and an audit detail page defaulting to the newest run.
Show run status, timestamps, source scope, per-dataset counts and collection issues.
Use simple labeled, paginated tables for collected data. Support license-to-assigned-user
drill-down and search. Distinguish an in-progress newest run from the last completed run.
No comparisons or collapsible category interface in this phase.

## 5. Verification and deployment

Validate migrations, constraints, tenant isolation, same-run retry behavior, repeated-run
history, paging and partial failures. Reconcile representative stored records and counts
with source responses. Verify an unavailable source is never presented as a clean result.

Keep schema changes in new numbered migrations. Document migration/application deployment
order, legacy-data handling, validation and rollback/recovery. Preserve historical JSON
evidence; do not fabricate typed evidence that cannot be reconstructed accurately.

Version permissions/bootstrap configuration and any infrastructure changes. Preserve Dev
resource names, the approved API-to-SQL subnet path and Dev/Prod isolation. Validate Bicep
and inspect what-if before infrastructure deployment; do not redeploy unreconciled legacy
templates. Update deployment workflows and docs/deploy-from-scratch.md as implementation
requires. Prove rebuild changes in a disposable environment before claiming reproducibility.

## Acceptance criteria

- Starting an audit creates a persistent run immediately, including eventual failures.
- Every collected record belongs to one tenant and audit and has UTC collection/storage timestamps.
- Each data type is stored in its dedicated table, with related child records linked correctly.
- Two runs retain independent snapshots; retries do not multiply records within one snapshot.
- Missing access, zero records, partial collection and failure remain distinguishable.
- History and detail pages read persisted SQL evidence and enforce tenant isolation.
- Requested report datasets, licenses/assignments and four score/recommendation sources are
  either collected or explicitly reported unavailable with a reason; omissions are visible.
- Collection works without questions, document uploads or comparison features.
