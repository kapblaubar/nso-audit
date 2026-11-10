# License audit schema: Dev deployment, November 9, 2026

Applied migration `017_audit_licensing.sql` directly to the existing Dev database at the
user's explicit request. No disposable database was created or used for this deployment.

## Target and change

- Resource group: `NSO-Audit` (Dev).
- SQL server: `nso-audit-dev-257f10d8.database.windows.net`.
- Database: `nso-audit-dev`.
- Recorded SQL application time: `2026-11-10T00:36:24.198Z` (November 9 in America/Los_Angeles).
- Used `scripts/database.mjs migrate --through=017_audit_licensing.sql` with Azure CLI
  authentication. No credentials were stored in the repository.

Before application, migrations 001–016 were present and all five candidate tables were
absent. Dev was online with point-in-time restore availability reported by Azure. Existing
operator SQL access worked; no firewall, VNet, resource-name or infrastructure changes were
made. The existing exact-IP operator SSMS rule was left unchanged.

## Verified after application

- Created `app.DataAudits`, `app.AuditCollections`, `app.AuditLicenses`,
  `app.AuditLicenseAssignments` and `dbo.AuditCollectionJobs`.
- All four queue security procedures exist.
- All twelve new predicates are attached to the enabled organization-isolation policy.
- Runtime impersonation confirmed audit reads, evidence inserts and execution of the four
  queue procedures; direct SELECT on the private job table is denied.
- The recorded migration checksum matches the versioned source.
- Re-running the versioned migration runner leaves the schema current without reapplying 017.

This verifies the deployed schema and permissions, not end-to-end Microsoft collection,
worker recovery or live API/browser behavior. No synthetic customer data was inserted.
Collection activation, Graph permissions/consent and application deployment were not changed
as part of this database-only task. Recovery and activation steps remain in
[the license audit runbook](../database/audit-licensing.md).
