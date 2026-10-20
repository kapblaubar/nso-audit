# Customer management (Dev)

## Dev connectivity repair, 2026-10-20

Management sign-in failed because the SQL firewall rejected observed Function worker egress
addresses `40.91.85.183` and `4.246.2.62`. Both exact addresses are now recorded in
`infra/sql.dev.bicepparam` and applied as `allowed-<ip-with-dashes>` firewall rules on the
existing Dev SQL server. Bicep compiled and the infrastructure what-if initially showed only
the first new firewall rule. The second address was discovered on the subsequent retry and
added using the same exact-IP rule pattern. No database schema or staff grants changed.
The live `/api/health` returned HTTP 200 with SQL storage healthy after the repair.
Chris's existing principal returned active `setupAdmin` through `security.GetManagementRole`
under `nso_api_runtime`; the subsequent user screenshot confirmed management access. Client creation was not exercised by this repair.
The temporary diagnostic operator firewall rule was removed.

Linux Consumption worker egress has changed beyond the ARM-listed outbound addresses.
If this recurs, inspect the Dev health response's `firewallDenied` reason and `clientIp`,
record the observed exact IP in the environment parameters, review SQL infrastructure what-if,
and apply its matching rule. Stable outbound networking remains required for reliable Prod hosting.
To reverse this repair, remove only these two rules and their parameter entries; customer data
and schema are unaffected, but affected workers will lose SQL connectivity again.

Staff use Microsoft Entra sign-in at `/clientmanagement`. Access additionally requires an active
`identitydata.ManagementUsers` entry and the exact configured staff Entra object ID; a Microsoft account alone does not grant management access.

Apply migrations through `009_contact_access_revocation.sql` before publishing the current customer API.
Migration 006 adds organization-scoped profiles and pending contacts, row-level security,
a private management directory, role-checked procedures and an audit trail. Existing scans,
connections and memberships are preserved. The existing nominated owner is copied into the
pending roster without activating an account.

Company name, primary contact name and primary contact email are required. Phone, website,
industry, location, employee/device counts, notes, Microsoft account, Entra tenant ID and
Azure subscription IDs are optional. A customer can be created without Microsoft services.
Microsoft identifiers are descriptive metadata; entering them does not establish consent,
credentials, connection authorization or scan access.

Roster entries contain name, email and intended role. They are pending profiles, not login
accounts or membership grants. Email verification, password reset and explicit staff activation are implemented in migrations 007?009;
see `customer-accounts.md`. Saving a removed contact revokes its email membership. Invitations remain separate work. Passwords must never be added to these profile fields.

Edits require the current version; concurrent changes are rejected instead of overwritten.
`scripts/verify-customer-management.mjs` validates an isolated disposable Dev customer,
authorization, row-level isolation, stale edits and absence of automatic access grants, then
removes its fixture. Run only against Dev with `CONFIRM_DEV_WRITE_TEST=yes` and operator SQL
credentials. Unit validation and mocked browser tests cover the form and non-Microsoft setup.

Recovery: roll back API/web releases first and retain the additive tables and migration ledger.
Do not delete customer records or reverse the migration to recover a frontend deployment.
Use SQL backup/restore procedures for data recovery; no production restore has been rehearsed.
