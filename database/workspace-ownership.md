# Initial Dev customer ownership handover

Requested identity split:

- `chris@newsommer.com`: existing NewSommer Entra setup administrator. Its management role
  remains assigned to the verified Entra tenant/object identity, not an email string.
- `kapblaubar@gmail.com`: intended customer owner of the existing NewSommer assessment workspace.

Migration 005 adds a private ownership-request catalog. `Request-NsoAuditWorkspaceOwner.mjs`
records a nomination and audit event using an authenticated SQL migration operator whose
Entra tenant/object claims match the supplied actor and an active management role. It requires
explicit environment values: `SQL_SERVER`, `SQL_DATABASE`, `OWNER_ORGANIZATION_ID`,
`MANAGEMENT_TENANT_ID`, `MANAGEMENT_OBJECT_ID`, `PREVIOUS_CLIENT_EMAIL`, `TARGET_CLIENT_EMAIL`.
Repeat execution is idempotent; a conflicting target is rejected. Grant temporary operator SQL
firewall access for execution and remove it afterward, following the SQL runbook.

Dev organization ID: `d4b896db-96aa-45f8-8fc3-37b572f42648`. Preserve this ID, its Entra connection,
scan IDs, consent and reports. Do not copy this customer seed into Prod.

On 2026-10-19, migration 005 and the nomination were applied. Repeated execution confirmed
`pendingVerifiedClient`, no matching client account, and Chris's management access preserved.
No password, session or membership was created, and no message was sent to the nominated email.
The request grants no runtime access. The existing Entra-based report path remains transitional.

Completion is still required: implement client registration/sign-in and mailbox verification,
then an authorized, atomic acceptance flow must match the verified account to the nomination,
grant its owner membership, remove only the specified previous client membership if one exists,
record completion/audit details and invalidate affected client sessions. Matching an email from
an unverified form or merging an Entra administrator with a client account is insufficient.
Workspace-owner handover must not remove Chris's Entra management role or reinterpret tenant
consent. No completion endpoint exists in this increment, so the handover is not yet active.
