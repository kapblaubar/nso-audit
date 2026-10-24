# Guided questionnaire intake (client-v2)

## Changes and storage

Migration 015 adds the immutable client-v2 catalog, question version 3, 12 sections
and 121 questions. It changes no tables, identities, networking, existing answers,
reviews or historical catalog definitions. Migration 014 and client-v1 remain frozen.
The compiler is `scripts/build-guided-questionnaire.mjs`; it derives unchanged questions
from frozen client-v1 and contains the five reviewed guided definitions. Requirements
are in `docs/questionnaire-pending-changes.md`.

Environments, business activities, providers, sensitive-information locations and report
purposes use structured rows in `app.ClientAssessmentAnswers.RecordsJson`. Provider
responsibilities are arrays of stable option IDs within each provider row. Do not look
for these in ClientAssessmentSelections: those remain for ordinary multi-choice questions.
Conditional fields are validated by the API; unrelated platform fields and unrecognized
options/keys are rejected. Most identifiers/details are optional; provider names, selector
values and Other descriptions are required. Rows are capped at 100 per question.

Client-v1 drafts remain readable/editable. Create guided copy sends a source assessment ID
and revision through the existing organization-authorized creation endpoint. The source
is locked during copy; stale revisions fail. Every new group has its own ID and copies
its original context. Original assessments and reviews stay intact. Copying retains known
platform identifiers and visible Previous details for legacy rows. Old business criticality
is not guessed into downtime tolerance. Conclusions are not copied to the new draft;
reviewer-only answers are copied only for an owner/admin. Unknown legacy row values and
unmapped wording remain available in the original and previous details. Verify classifications
after copying. Oversized legacy groups fail validation rather than truncating data.

## Deployment order

1. Run both catalog compilers with `--check`, workspace typechecks, API tests, and
   `npx playwright test --config playwright.management.config.ts tests/client-assessment.spec.ts`.
2. Use `scripts/Deploy-NsoAuditQuestionnaires.ps1` with explicit Dev subscription,
   current exact operator IPv4, a new `nso-audit-validation-<8 hex digits>` database name,
   and the existing API runtime client ID. Run without `-Apply` first and inspect what-if.
   Expected changes are the disposable validation database and its exact-IP operator rule.
   Do not apply unrelated infrastructure changes. No persistent infrastructure is changed.
3. Repeat with `-Apply`. The wrapper validates 014, applies through 014 to the disposable
   database, validates candidate 015 transactionally, then migrates through 015 and verifies
   old and guided storage under runtime row isolation. It applies migrations to Dev only
   after disposable validation. It repeats the migration runner to check idempotence, then
   publishes API before web and runs synthetic authenticated round-trip checks.
   For a release through GitHub Actions, add `-DatabaseOnly` to both preview and apply:
   this performs the same disposable-first migration and cleanup, then stops before
   publishing either app. After it succeeds, run Deploy API, confirm its success, and
   run Deploy web if needed. Run the synthetic API/browser verifier separately with
   explicit Dev targets and temporary exact-IP operator access.
4. Verify real guided creation, all five forms, hybrid platforms/multiple accounts, multiple
   insurers/frameworks, save/reopen, source preservation when copying, viewer restrictions,
   independent backup scopes and mobile layout. Synthetic checks send no email and remove
   their own fixtures. The wrapper cleans up its disposable database and operator rule.
   A separate SSMS operator rule is separate; remove it when that session is finished.

Pushing code does not apply SQL migrations. Install 015 before publishing this API.
Creation returns a clear service-unavailable message when the guided catalog is absent;
existing v1 assessments continue to load. API/web workflow validation checks both catalogs.
Do not claim a live release based only on compilation or local tests.

## Independent candidate validation

With explicit Dev/disposable SQL environment variables, Azure CLI authentication and
`CONFIRM_DEV_WRITE_TEST=yes`, run `node scripts/verify-guided-questionnaire.mjs
--validate-migration` before 015 is installed. Without the flag, it verifies the installed
catalog. It always rolls back fixtures and any candidate migration. Compile the API first.

Local validation on 2026-10-23 passed candidate 015 on existing Dev in a rolled-back
transaction: SQL catalog matches the generated definitions, all five guided row shapes
round-trip under the runtime identity, multi-select arrays and hybrid/multiple-purpose
records persist, missing workspace context hides rows, and v1 definitions are unchanged.
This is candidate validation, not a committed migration or a verified deployment.

## Recovery

Roll back API/web artifacts if needed; retain additive migration 015 and all saved data.
Older API versions cannot open v2 assessments; preserve them until the fixed API is deployed.
Original v1 drafts remain available when a guided copy is unsuitable. Do not downgrade v3
answers, delete new catalog entries or rebuild the database to roll back. Accidental data
loss requires backup recovery into a separate database and a reviewed forward repair.

## Location-first sensitive-information form

The storage UI starts with Add another storage location. Each card selects a system,
optional site/folder/application name, multiple information types, and optional owner.
Saving expands each card into one existing RecordsJson row per selected data type;
loading groups matching system/location/owner/previous-details rows into a single card.
Other information types and Other systems retain their descriptions. This adapts the
existing immutable client-v2 definition without changing the catalog, SQL schema or API
contract. No migration or additional guided copy is needed for existing v2 assessments.
Publish the web change and validate selecting multiple types, save/reopen, removal,
clearing and existing saved rows. Roll back the web artifact if needed; saved rows are
compatible with the previous renderer. Insurer document upload/import is deferred.
