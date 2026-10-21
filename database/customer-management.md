> Networking update 2026-10-20: the historical worker-IP repairs below are superseded by the
> approved VNet/Flex migration. Do not add more Function worker IP rules. Follow
> [networking requirements](../docs/networking-requirements.md) and
> [the deployment runbook](../docs/deploy-from-scratch.md). Historical entries are retained as incident evidence.

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
Historical diagnostic procedure (superseded): inspect the Dev health response's `firewallDenied` reason and `clientIp`,
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

## Dev staff sign-in connectivity recurrence, 2026-10-20

A later staff sign-in attempt coincided with `/api/health` reporting SQL `firewallDenied`
for worker egress `4.246.2.36`. The configured staff tenant/object ID remained correct.
Added that exact IP to `infra/sql.dev.bicepparam`; inspected SQL what-if, which showed only
its firewall rule creation, then applied the matching `allowed-4-246-2-36` rule.
The live health check subsequently returned healthy SQL storage. No auth grants, application
release or schema changed. Interactive staff sign-in still needs the user to retry.
This recurrence reinforces that fixed outbound networking is still unresolved for the current
Linux Consumption hosting; individual exact-IP repairs do not guarantee future worker connectivity.
Rollback removes only that firewall rule and parameter entry, without changing customer data.

A later customer-load failure on 2026-10-20 coincided with SQL rejecting observed worker egress
20.252.25.39. Recorded the exact address in Dev Bicep parameters, inspected what-if (only that
firewall rule creation), and applied its matching rule. SQL health returned healthy. A read-only
lookup found kapblaubar@gmail.com in the NewSommer customer directory as primary contact but no
identitydata.Users account or membership for that email. No account or access grant was created.
Temporary operator diagnostic access was removed. Stable outbound networking remains unresolved.

A subsequent staff sign-in report on 2026-10-20 coincided with SQL firewall denial for
52.183.112.167. Added the exact address to Dev parameters, inspected what-if (only that
rule creation), and applied its matching firewall rule. SQL health returned healthy.
No application, identity, credential or schema changed. This is a temporary connectivity repair.
Further IP enumeration cannot establish reliable connectivity for Linux Consumption.
The next infrastructure investigation should assess Flex Consumption with virtual network
integration and subnet-based SQL access, preserving the current resources until an explicit
migration and rollback plan is validated. Do not enable a broad Azure-wide firewall bypass.

After refreshing GitHub refs on 2026-10-20, local main matched origin/main at 4b61d2b.
The remaining sign-in failure was independently reproduced by SQL health: firewallDenied for
4.155.178.241. Added it to Dev parameters, inspected what-if (only its new firewall rule), and
applied the matching exact-IP rule. SQL health returned healthy. This does not establish reliable
future connectivity; no staff identity, account grant or application release was changed.

## Staff access diagnostic release, 2026-10-20

Verified the configured staff tenant/object retains setupAdmin when GetManagementRole is called
under nso_api_runtime. Entra app configuration still requests v2 access tokens and includes both
management redirect routes. The browser's authenticated request remains unverified.

API now returns distinct session-invalid (401), staff identity/role denial (403), and database or
configuration unavailable (503) results. Signed-in staff can Retry access without another Microsoft
login. Dev support details contain only a failure code and, for observed SQL firewall denials, the
blocked public worker IP. They never contain tokens, claims or raw SQL exceptions.

Sixteen API tests, eight browser tests, web type checks and targeted retry/support-control checks
passed. API and web were deployed through versioned scripts, and the live bundle contains Retry
access and Copy support details. Unauthenticated staff bootstrap returns session_invalid/401.
No database migration or access grant changed. Temporary operator diagnostic firewall access was
removed. API deployment exposed worker IP 172.179.85.149; added the exact address to Dev parameters,
inspected what-if showing only its firewall rule, and applied that rule. Public SQL health then
passed; this does not establish availability for every authenticated staff request.

A subsequent save/activation failure on 2026-10-20 reported customer database unavailability.
Public health independently showed firewallDenied for 20.3.32.145. Added it to Dev parameters,
inspected what-if (only its firewall rule creation), then applied the exact-IP rule. Public health
returned healthy. User screenshots confirm successful Microsoft authentication followed by a
database-stage failure; authenticated-request diagnostics are pending. No customer edit, account
activation, permission change or application deployment was performed during this repair.

## Customer version encoding repair (2026-10-20)

`rowversion` converted directly to varchar returned raw bytes despite the conversion style.
The API requires an 18-character hexadecimal concurrency token, so every update was rejected
with "Reload this customer before saving." Migration `011_customer_version_encoding.sql`
casts Revision to binary(8) before hexadecimal conversion in list/get/save procedures and the
optimistic concurrency comparison. It preserves role checks, locks, RLS and contact revocation.
No customer data migration, grants or infrastructure changes are needed.

Deploy with `node scripts/database.mjs migrate` against explicit Dev SQL using temporary exact
operator access, then run `scripts/verify-customer-management.mjs` with
`CONFIRM_DEV_WRITE_TEST=yes`. The regression now validates returned list/get versions through
the API input validator and performs two successive saves while still rejecting an older token.
The old verifier bypassed input validation and therefore missed this failure. Fixtures and
operator firewall access must be removed in finally. Reopen existing browser forms once; their
in-memory version tokens predate the repair. Preserve unsaved edits before reopening.

Deployment order: migration first; existing API/web work with the corrected format immediately.
Recovery: the migration is transactional and rolls back all procedure changes if it fails.
If a later issue occurs, use a forward migration preserving the hex-token contract; reverting
to raw-byte output restores the save failure. No database restore or schema rollback is needed.

## Invitation onboarding

Migration 012 supersedes the manual register/verify/activate instructions for new invitations.
See [customer invitations](../docs/customer-invitations.md). Contacts saved before deployment
are retained; Chris explicitly chooses Send invitation. No automatic mail or access grants run
during migration.
