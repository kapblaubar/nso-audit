# Directory access snapshots

The **Users, Groups & Roles** menu reads the selected audit's saved Entra evidence. A full tenant audit collects users with account status, group inventory, direct group membership, role definitions, role assignments and PIM role eligibility. The page shows directory and application scope for assignments, including direct assignments and roles assigned through direct group membership.

Role definitions and role assignments are separate Graph calls. The assignment query expands only `principal`. The earlier two-property expansion returned HTTP 400 in NewSommer. The role catalog joins by role definition ID within the same audit, so successful assignment collection can show zero for an unassigned role. Existing snapshots retain their evidence and collection status. Users, groups or counts missing from those snapshots are shown as unavailable.

Group counts use group type, security flags and synchronization status. Groups with a non-null synchronization flag were synchronized from on-premises at some point. Membership is direct. Microsoft Graph v1.0 has a known service-principal membership omission, and hidden membership requires separate consent for `Member.Read.Hidden`. Role eligibility is shown separately from assigned roles and reflects the saved eligibility window. The PIM request sets an explicit English locale because the service rejects the wildcard Accept-Language header.

## Deployment and recovery

1. Use the existing audit app registration. Preview `scripts/Set-NsoAuditApiPermissions.ps1` with `-IncludeDirectoryInventory -WhatIf` and retain the other switches appropriate to the tenant. For an existing app, use the additive `scripts/Set-NsoAuditLicensePermissions.ps1 -DirectoryInventory` path with explicit tenant and application IDs. The tenant administrator can use `-GrantConsent` to grant `User.Read.All` and `GroupMember.Read.All`. The existing `RoleManagement.Read.Directory` application grant covers the three role datasets, including eligible role instances. No Azure RBAC or network change is required.
2. Validate migrations 021 and 022 against a schema through 020, then apply them with `node scripts/database.mjs migrate --through=022_directory_membership_parent.sql`. Verify the three organization isolation predicates per new table, the migration checksums, and the group membership dependency and foreign key to the saved Entra group. Existing audits need no data migration.
3. Publish API before web with the versioned scripts. Run a fresh tenant audit and check the six directory datasets in **Collection details**. Verify the totals and inspect a known user, group and assigned role. Check an unassigned role and an eligible role when available. A successful build establishes code compilation only.
4. Roll back the web and API packages if needed. Retain the additive migration and evidence. Quiesce or let new directory jobs finish before rolling back to a worker that does not recognize those job types.

- [Microsoft Graph role assignments](https://learn.microsoft.com/en-us/graph/api/rbacapplication-list-roleassignments?view=graph-rest-1.0)
- [Microsoft Graph role definition properties](https://learn.microsoft.com/en-us/graph/api/resources/unifiedroledefinition?view=graph-rest-1.0)
- [Microsoft Graph role eligibility](https://learn.microsoft.com/en-us/graph/api/rbacapplication-list-roleeligibilityscheduleinstances?view=graph-rest-1.0)
- [Microsoft Graph group membership](https://learn.microsoft.com/en-us/graph/api/group-list-members?view=graph-rest-1.0)
