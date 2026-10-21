# Customer workspace invitations

Approved 2026-10-20. Client contacts are saved by Chris at `/clientmanagement`. Saving customer
edits never sends mail automatically. After saving a contact, **Send invitation** sends an email
through the existing Azure Communication Services Email sender. Pending invitations offer
**Resend invitation**; the UI shows pending or active access. Staff confirm the exact recipient,
workspace and role before sending. Unsaved contacts/edits must be saved first.

## Recipient flow

The email opens `/account/invitation#token=...`. The page removes the fragment from the address
bar, checks the link and displays the invited email, customer and saved role. A new or unverified
email user chooses a password and confirms it. Accepting the invitation verifies email ownership
and grants that workspace role atomically. There is no separate registration, verification email
or staff activation step. The user then signs in at `/signin`.

An existing verified email account must sign in with that same account before accepting. Its
password is never changed by an invitation, even if a password field is supplied to the API.
A session belonging to another email cannot accept. Password reset remains a separate flow.
Microsoft sign-in and Microsoft tenant consent remain separate; workspace invitations use the
NSO Audit email account and do not grant Microsoft cloud permissions or create staff access.

## Security and delivery requirements

- Cryptographically random 256-bit tokens, stored only as SHA-256 hashes in the private identity
  catalog. No raw tokens/passwords in logs, SQL rows, query strings, audit details or admin responses.
- Default lifetime 72 hours, parameterized per environment with a 1-168 hour bound.
- Single-use transactional acceptance; replay, expiry, disabled accounts and suspended customers
  fail closed. Request inspection never activates access. User confirmation/password submission
  is required, so merely opening an email or scanning its link grants nothing.
- Invitation targets come from the saved contact and customer. Caller-supplied roles/emails or
  organization IDs on the acceptance request cannot alter the grant.
- Only the exact authorized staff identity plus an active SQL management role can send. Runtime
  gets procedure execution grants, not SELECT access to invitation hashes or identity tables.
- Resending replaces prior pending links, with a one-minute resend cooldown. Saving contact
  removal, email or intended-role changes revokes pending links permanently. Existing access
  revocation on saved contact removal is preserved.
- Delivery is marked eligible only after ACS reports successful send. On reported failure the
  new link is revoked and no new access is granted. A staff retry creates a fresh invitation.
  ACS acceptance does not guarantee inbox delivery; recipients should also check spam.
- Public endpoints use existing SQL-backed peer/token throttling, origin validation and no-store
  responses. Trusted client-IP handling remains compatible with the approved Front Door gate.
- Test-account deletion removes matching invitation records. Customer and assessment data remain.

## Infrastructure and deployment

Use the existing per-environment ACS endpoint, sender, runtime managed identity and sender role
from `infra/account-email.bicep` and `infra/api-network.bicep`. No new email provider, secret,
identity grant or resource is required. `invitationLifetimeHours` sets `ACCOUNT_INVITATION_HOURS`
in the API's Bicep-managed environment configuration. No Dev endpoint/identity is copied to Prod.

1. Apply migrations through `012_workspace_invitations.sql` with `scripts/database.mjs migrate`.
   Migration 011 fixes the customer version format and must precede 012. Applied migration files
   remain immutable. No customer data backfill or automatic invitation sending is performed.
2. Compile templates/parameters, inspect what-if, apply the additive environment configuration.
3. Deploy API code, validate SQL-backed health and invitation endpoints, then deploy web.
4. Run `scripts/verify-workspace-invitations.mjs` with explicit Dev SQL targets and
   `CONFIRM_DEV_WRITE_TEST=yes`; optional `INVITATION_TEST_API_BASE_URL` must be the approved
   Dev Flex API. `Test-NsoAuditApiNetwork.ps1 -Suite Invitations` wraps this with a unique
   exact operator-IP rule and automatic cleanup. It seeds disposable fixtures and simulates delivery marking without sending
   mail, verifies security properties and cleans up in finally. Remove exact operator firewall
   access afterward. Run customer-management regression and browser tests as well.
5. Verify actual delivery by sending a user-approved invitation in management. Automated checks
   deliberately send no real email. Record provider send and recipient completion separately.

Migration 012 adds a private invitation catalog and narrow procedures, and alters customer
read/save and Dev account cleanup procedures. Migration application is transactional. No table
or customer account is dropped. A repeat migration run must report schema current.

## Recovery

On migration failure, its transaction restores the previous schema/procedures. On application
failure, roll web back first and republish the known-good API package; keep the additive schema
and accepted memberships. The legacy explicit activation endpoint remains for compatibility.
Do not drop invitation tables or reverse account verification/memberships to roll back code.
Correct schema issues with a new forward migration. Resend invalidates an old pending link;
contact removal revokes access according to the existing saved-roster rules.

## Dev validation recorded 2026-10-20

Migration 012 applied and a repeat migration run reported schema current. The updated customer
management regression passed with canonical version validation and repeated saves. Invitation
SQL tests passed for new/unverified users, existing-account password preservation, disabled
unauthorized operations, expiry/replay, resend cooldown and replacement, failed delivery,
contact removal/role-change revocation and private token permissions. Live API tests passed for
inspection, password policy, acceptance/login, exact workspace/role isolation, token replay,
customer denial on staff send, and existing-account session matching. Test-account deletion
removed its invitation records. Disposable fixtures and operator SQL firewall access were removed.

All 19 API tests and 11 browser entry/management tests passed; repository typecheck and web build
passed. The relevant Bicep/parameters compiled, what-if was inspected and the configuration
applied successfully. Runtime `ACCOUNT_INVITATION_HOURS` is 72; SQL-backed health is healthy.
No real invitation email was sent as part of these checks, so inbox delivery still requires the
staff Send invitation action. This validates the additive Dev feature, not a full Prod rebuild.
