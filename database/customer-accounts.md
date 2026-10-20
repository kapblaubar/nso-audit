# Customer accounts

Customers enter through `/signin`, choosing Microsoft work sign-in or an NSO Audit email/password
account with any email provider. Staff enter at `/clientmanagement` and require the configured
Entra tenant, exact staff object ID and active SQL management role. Email accounts cannot authenticate
as staff. The Dev staff object corresponds to Chris's approved NewSommer Microsoft identity.

Migrations 007 through 009 provide password/session/token procedures and persisted throttling.
Passwords are salted scrypt hashes (N=32768, r=8, p=3), never plaintext or reversible ciphertext.
New and reset passwords require 15 to 128 characters, an uppercase letter, a lowercase letter,
a digit (0-9), and a punctuation or symbol character. Whitespace alone does not count as a special character; password managers and paste are supported. Tokens contain
32 random bytes, with only SHA-256 token hashes stored in SQL. Email verification expires after
24 hours, resets after 30 minutes, and sessions after eight hours. Verification/reset links carry
the token in the browser fragment; the client removes it before submitting it by POST. Consuming
a link invalidates sibling links of that purpose. Reset revokes all existing email sessions.

Runtime SQL has execute grants to narrow procedures, not schema-wide access to identity tables.
Authentication attempts are bounded per email/token and platform-forwarded peer with persistent
15-minute windows. Password work also has an instance-level concurrency limit. Registration and
email-link requests use generic success text to avoid explicitly disclosing account existence.
Provider errors can affect response timing; this is not a guarantee against timing-based enumeration.

Sessions are opaque bearer tokens held in tab-scoped sessionStorage because the existing API and
SWA are on different sites. They are not put in URLs or localStorage. All data requests revalidate
expiry, revocation, disabled-user status and membership server-side. Maintain XSS protections;
frontend storage cannot make a bearer token immune to malicious same-origin script execution.

Registration verifies identity only. It does not auto-create organizations, activate pending
contacts, copy staff authority or grant membership based on email/domain. Staff save a contact,
then explicitly activate access after the user has verified the matching email account. The saved
intended role becomes an explicit membership and the activation is audited. Saving a removed contact atomically revokes that email account?s membership and records an audit event.
Changing an intended role requires explicit reactivation to update existing access.

Email account sessions list explicitly assigned customer workspaces. Where an approved
`security.EntraConnections` mapping already exists, they can open the existing audit/report flow.
Audit targets come from a live session plus explicit organization membership, never a browser-supplied
tenant. Active organization status is checked; viewers cannot POST audit/access-check operations.
Unconnected workspaces show connection pending. Saving Microsoft tenant metadata does not create
an approved connector. Connector provisioning, tenant admin consent and Azure RBAC remain separate.
Microsoft organizational sign-in retains the existing tenant audit workflow; accounts are not
silently merged with local email accounts based on matching email addresses.

Email delivery uses ACS with an Azure-provided sender and the API's managed identity. Endpoint,
sender and portal origin are public runtime settings configured by the versioned script.
No ACS key or email password is required. ACS email is usage billed; see
[Microsoft's pricing](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email-pricing).
The selected sender resource role is scoped to the single Communication Service.

Deployment order, rollback and inbox validation are documented in `docs/deploy-from-scratch.md`.
The transactional Dev verifier covers registration, duplicate protection, verification gating,
session rejection, reset revocation, stale-password rejection, rate limiting, membership isolation
and removed-membership denial. Fixtures and candidate migrations are rolled back. Unit tests cover
password hashing and exact staff identity enforcement; browser tests mock providers and account API.
Actual Microsoft authentication and inbox delivery require separate live verification.

These changes do not constitute a production identity/recovery review or a clean rebuild rehearsal.
Retain the additive schema on rollback and use forward migrations for future changes. Never edit
an applied migration or copy Dev identities, users, sessions or credentials into Prod.

## Dev release validation, 2026-10-20

- Email infrastructure deployed successfully after compilation and inspection of a create-only
  what-if. Existing platform resources were preserved. Runtime email configuration and the exact
  Dev staff object ID were applied through the versioned script.
- Migrations 007?009 validated transactionally before application; checksums/idempotence were
  checked after 007/008 and the migration runner applied 009 successfully.
- API and frontend deployed using the versioned publish scripts. The live `/signin` bundle
  contains Microsoft/email choices and password recovery, without the public staff link.
- Thirteen API tests, five mocked browser tests, type checks and the application build passed.
  Transactional SQL tests used `nso_api_runtime`, including saved-contact-removal revocation.
- `scripts/verify-customer-account-api.mjs` passed against live Dev with a disposable verified
  account: login/session, workspace isolation, viewer write denial, staff denial, reset link
  replay rejection, old-session revocation and logout. The account and workspace were removed.
  This verifier deliberately seeds a verified account and does not send email.
- CORS preflight allows the expected portal and organization header. SQL health returned 200.
  The deployment briefly served old/new routes during worker startup before checks passed.
  Temporary operator SQL firewall access was removed.
- Actual inbox receipt and the interactive Microsoft identity-provider flow require user
  verification. No clean full-environment rebuild or production restore rehearsal was performed.

Password complexity is enforced by the API for registration and reset, with matching browser guidance and validation. Existing passwords remain usable until changed; Microsoft passwords follow Microsoft tenant policy. This policy change requires API and web deployment only, with no database or infrastructure changes.

Password-policy update validation (2026-10-20): 14 API tests, six browser tests and web type checks passed. API and web deployed to Dev. After deployment startup settled, live registration and reset requests missing uppercase letters both returned HTTP 400 with the new complexity guidance.

## Repeat testing in Dev

Staff can delete an email account from the **Test accounts** section of `/clientmanagement`.
Both the API environment guard and staff authorization must pass. The exact email must be typed
before deletion. Migration 010 removes credentials, sessions, verification/reset tokens, registration
requests, memberships, matching roster entries and user-actor audit records in one transaction.
Completed ownership records referencing the deleted account are removed. Shared answers retain
their content with nullable attribution; customer workspaces and company profile metadata remain.
Per-email and account-token throttling buckets are removed; shared IP throttle buckets remain.
Backups and already delivered emails are not altered. Re-registering creates a new user ID and
requires fresh email verification and staff access activation. Staff cleanup audit events contain
no target email or user ID. Existing customer editors become stale when their roster changes.

Use `scripts/verify-account-cleanup.mjs` for rolled-back fixture validation, including same-email
re-registration, session/token/grant removal and preservation of a neighboring user and shared
assessment answer. The deployment/recovery order is in `docs/deploy-from-scratch.md`.

Dev cleanup release validated 2026-10-20: candidate migration 010 passed transactional runtime
verification, was applied, and a repeat migrate run confirmed checksums/idempotence. The verifier
passed again after application. Fifteen API tests, seven browser tests and type checks passed.
API and web were published through the versioned scripts. Live cleanup endpoints reject anonymous
requests (403); CORS preflight allows DELETE from the configured portal. The live web bundle contains
the typed-email deletion controls. No real account, including kapblaubar@gmail.com, was deleted
as a deployment test. Temporary diagnostic operator firewall access was removed.

Deployment exposed worker egress addresses 52.175.252.238 and 172.179.80.209. Each was added to
Dev Bicep parameters; SQL what-if showed only the corresponding new firewall rule before its exact-IP
rule was applied. SQL health subsequently returned healthy. Stable egress remains unresolved.
