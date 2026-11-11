# Directory role evidence

New tenant audits collect Microsoft Entra directory role assignments with `$expand=roleDefinition,principal` from Microsoft Graph v1.0. The existing RoleManagement.Read.Directory and approved user-read permissions are used. No additional grants, infrastructure changes, or SQL migrations are required.

`app.AuditRoleAssignments.DisplayName` holds the role name. `SourceJson` preserves the expanded role definition and principal alongside assignment, scope, and object IDs. Collector version: tenant-data-v3-roles. Existing snapshots are never rewritten or enriched using current directory state.

The explorer shows role names, assignees, principal type, user principal name/email when returned, and scope. Missing metadata is explicit; older snapshots require a new audit for captured names. Limited-information principals remain identifiable by ID without being classified as users.

The priority summary covers Global Administrator, Privileged Role Administrator, and Privileged Authentication Administrator using their role template IDs, not mutable display names. Counts load every saved page independently of inventory search. Assignment counts and distinct directly assigned users are separate. Group members and PIM eligibility are not collected. This shortlist is not a complete privileged-role inventory or vulnerability finding. Incomplete collections and missing template metadata qualify the counts.

## Deployment and recovery

Run API tests, web build, and `node scripts/test-audit-data-ui.mjs`. Publish API using `scripts/Publish-NsoAuditApi.ps1`, then web using `scripts/Publish-NsoAuditWeb.ps1` and Dev public configuration. Run a new tenant audit and inspect Directory role assignments. Old audits retain their original evidence. Rollback is application-package rollback; expanded JSON is backward-compatible and no data rollback is required.

## Sources

- https://learn.microsoft.com/en-us/graph/api/resources/unifiedroleassignment?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference
