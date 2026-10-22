# Dev backup questionnaire deployment — 2026-10-21

## Applied and verified

- Inspected `infra/sql-validation.bicep` what-if: two temporary creations only (disposable Basic
  database and exact operator-IP firewall rule); existing server, Dev database, VNet and apps ignored.
- Rebuilt the disposable database through migrations 001–012, bootstrapped the restricted runtime
  SQL principal, validated candidate 013 in a rolled-back transaction, then applied 013 there.
  Questionnaire and account-cleanup verification passed on that disposable database.
- Applied additive migration 013 to `nso-audit-dev` using the migration identity. Repeat migration
  run reported schema current. Existing scan/customer tables and IDs were preserved.
- Dev SQL verification passed for organization isolation, no-connector membership, cleared session
  context, typed answers, coverage constraints, catalog protection, optimistic revisions, revoked
  sessions, and test-account deletion preserving questionnaire answers.
- Published API code to `nso-audit-dev-api-flex`, then web assets to `nso-audit-dev-web` using the
  existing public Dev configuration. The legacy API was not redeployed. SQL-backed API health passed.
- Live API verification passed for create/read/save/reopen, all 25 database backup questions,
  typed values, invalid-save rollback, stale revisions, viewer write denial and cross-client denial.
- The deployed browser opened a client with no Microsoft connection, changed an answer, saved
  the draft and reopened the persisted answer. Screenshot: local ignored artifact
  `.azure/browser-results/questionnaire-live-dev.png`.
- Synthetic client/account fixtures were removed in finally; no email was sent and no real client
  permissions were granted. The disposable database and exact-IP firewall rule were removed.
- Final post-cleanup check: SQL-backed API health is healthy, public SQL firewall rules are empty,
  and only the existing Dev database and master remain on the server. The API subnet rule is Ready.

## Using the form

Open https://blue-mushroom-0b2666c1e.7.azurestaticapps.net/signin with an authorized client email
account. Select **Questionnaire** beside the workspace. Create a backup assessment for an asset
class and named environment, enter answers and select **Save draft**. Reopen it from the saved list.
Owners, admins and contributors can enter data; viewers can read. Microsoft-only/staff sessions
do not automatically grant client questionnaire access.

This release covers backups; the other questionnaire domains, automatic grading, private uploads
and approved report snapshots remain future work. These checks verify this additive Dev release,
not a full clean platform rebuild, Prod readiness or an actual customer backup restore.

Deployment/recovery commands: [questionnaire runbook](../database/questionnaires.md).
