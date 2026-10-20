# Customer management (Dev)

Staff use Microsoft Entra sign-in at `/clientmanagement`. Access additionally requires an active
`security.ManagementUsers` entry; a Microsoft account alone does not grant management access.

Apply migrations through `006_customer_management.sql` before publishing the customer API.
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
accounts or membership grants. Verified invitations, password hashing, reset and activation
remain separate implementation work. Passwords must never be added to these profile fields.

Edits require the current version; concurrent changes are rejected instead of overwritten.
`scripts/verify-customer-management.mjs` validates an isolated disposable Dev customer,
authorization, row-level isolation, stale edits and absence of automatic access grants, then
removes its fixture. Run only against Dev with `CONFIRM_DEV_WRITE_TEST=yes` and operator SQL
credentials. Unit validation and mocked browser tests cover the form and non-Microsoft setup.

Recovery: roll back API/web releases first and retain the additive tables and migration ledger.
Do not delete customer records or reverse the migration to recover a frontend deployment.
Use SQL backup/restore procedures for data recovery; no production restore has been rehearsed.
