# Questionnaire storage and first form

Superseded for the current client experience by [full client assessments](client-assessments.md)
and migration 014. The notes below document the preserved migration-013 backup-only release.

Dev deployment and live validation are recorded in
[2026-10-21 deployment notes](../docs/questionnaire-deployment-2026-10-21.md).

Implementation scope: backup questionnaires, one named asset/environment scope per assessment.
The full questionnaire in `docs/client-assessment-questionnaire-v1.md` remains the expansion
backlog. Other domains, automatic grading, evidence uploads and reviewer/report approval screens
are not implemented by this slice. Evidence references and explanations are text only.

## Data model

Migration `013_questionnaires.sql` is additive and preserves existing assessments, JSON answers,
scans and customer IDs. It introduces:

| Object | Purpose |
| --- | --- |
| `questionnaire.Questions` | Versioned question definitions, template, order, input type and help |
| `questionnaire.QuestionOptions` | Versioned options for status, single-choice and multiple-choice questions |
| `app.QuestionnaireScopes` | One asset class, scope name, optional tenant ID and revision per assessment; references existing `app.Assessments` |
| `app.QuestionnaireAnswers` | Typed nullable answer columns, explicit answer state, explanation, evidence reference, respondent and timestamp |
| `app.QuestionnaireAnswerSelections` | Multiple-choice option selections without comma-separated values |
| `security.AuthResolveQuestionnaire` | Live email-session/membership resolution, independent of Microsoft connection consent |

Supported types are YN, Status, Coverage, Select, Multi, Date, Text and Number. Unused typed
columns remain NULL. Unanswered questions have no answer row; Unknown, Not applicable and Never
are explicit states. Not applicable requires justification. Never applies only to date questions;
a frequency option named Never is an ordinary selected answer. Coverage is measured counts or
an explicit estimate, with measurement date/source. Its percentage is derived, not independently
stored alongside counts. Zero systems requires an applicability decision, never an automatic pass.

The initial catalog contains 23 general backup questions, plus two database-specific questions.
Compound draft questions for encryption and recovery targets are split into separate inputs.
Each assessment uses `backups-v1`, with the database supplement when its asset class is DB.
Multiple-choice rendering/storage is available for later catalog additions; this backup seed
does not yet contain a multiple-choice question. Detailed retention tiers and repeated owners
are recorded in explanations in this first form, rather than separate structured child records.

Versioned templates must remain immutable. Change questions/options through a new forward
migration with new question and template versions, then explicitly support the new template in
the API. Do not edit migration 013 after application or replace wording in previously used rows.
Existing assessments continue using their original template. No data backfill is required now;
do not automatically reinterpret legacy JSON answers as typed answers.

## API and authorization

The browser calls the configured Function API; it never connects to SQL or receives SQL credentials.
Dev uses `nso-audit-dev-api-flex` over the approved VNet/subnet SQL path. The older Dev API was
retained for rollback, not as a second database service. This slice needs no new permanent Azure
resources, Azure role assignments, runtime settings or persistent firewall rules; SQL grants are
part of migration 013. Existing shared Bicep/network parameters remain authoritative;
Prod must supply separate API/SQL targets and identities.

The customer workspace list includes a **Questionnaire** button, even without a Microsoft tenant.
Use an NSO Audit email login with live organization membership. Microsoft-only and management
logins are not implicitly granted questionnaire access. Staff who fill in a customer assessment
must have an explicitly authorized customer membership for this initial form.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/me/questionnaires` | List this client's backup assessments |
| `POST /api/me/questionnaires` | Create a draft with scopeName, assetClass and optional tenantId |
| `GET /api/me/questionnaires/{assessmentId}` | Load the scope, versioned question catalog and saved answers |
| `PUT /api/me/questionnaires/{assessmentId}` | Replace the draft's answer set atomically using its expected revision |

All endpoints require the email bearer session and `X-Nso-Organization-Id`. The organization
header is a requested workspace, not proof of authorization. The API resolves active organization
membership server-side, then uses pinned SQL organization context; row-level security also
protects every new client table. Owners, admins and contributors can create/save; viewers can read.
Tenant ID is scope metadata and never grants access to another client. Cross-client IDs must
not reveal assessment data. Responses are not cacheable. Writes enforce the configured portal
origin when an Origin header is present and have a 128 KiB character limit.

Save includes the complete current response set; omitted responses become unanswered. Each
provided answer must be valid for its type, including required subfields. Leave an untouched
question Unanswered to save other completed responses. Conflicting/stale saves return 409,
preserve the server draft and leave local edits visible. Only draft assessments accept edits.
Each successful save advances a revision and appends an audit event; revisions are concurrency
tokens, not historical snapshots. This slice does not expose submission/approval or change
assessment status. Do not treat mutable drafts as approved report snapshots.

Questionnaire respondents are nullable only to preserve assessments when the existing Dev-only,
explicitly confirmed test-account deletion removes a login. The migration updates that procedure
to detach the respondent inside each authorized organization context without deleting answers.

## Deployment, validation and recovery

The Dev-specific wrapper `scripts/Deploy-NsoAuditQuestionnaires.ps1` plans a uniquely named
disposable database and exact-IP operator rule using `infra/sql-validation.bicep`; it does not
redeploy the existing SQL server or application infrastructure. Run without `-Apply`, inspect
what-if, then repeat with the same explicit subscription, validation database name, operator IP
and runtime client ID plus `-Apply`. It verifies migrations in the disposable database, applies
013 to Dev, publishes API then web, and verifies the live API/browser with synthetic fixtures.
Its finally block removes the disposable database and temporary firewall access. It is restricted
to the existing Dev resources and is not a Prod deployment script.

For the disposable baseline, `node scripts/database.mjs migrate --through=012_workspace_invitations.sql`
applies only through 012. Normal `migrate` still applies all pending migrations and verifies their
checksums. `scripts/verify-questionnaire-api.mjs` requires explicit Dev SQL/API targets and
`CONFIRM_DEV_WRITE_TEST=yes`; setting `QUESTIONNAIRE_TEST_PORTAL_URL` also runs the deployed
browser save/reopen test. Fixtures contain no real customer data or email delivery.

1. Confirm the environment-specific SQL/API targets and recovery point. Follow the existing
   networking runbook for temporary operator exact-IP access; never add Function worker IPs.
2. With migrations 001–012 present, validate candidate 013 on a disposable database first:
   set the explicit disposable Dev SQL targets and `CONFIRM_DEV_WRITE_TEST=yes`, then run
   `node scripts/verify-questionnaires.mjs --validate-migration`. It applies the candidate and
   tests fixtures inside a rolled-back transaction. This is migration verification, not proof
   of a clean infrastructure rebuild. Do not use the candidate flag after 013 is already applied.
3. Run `node scripts/database.mjs migrate` using the migration identity. Re-run to confirm the
   schema is current. Never grant migration rights to the Function runtime.
4. Run `node scripts/verify-questionnaires.mjs` and `node scripts/verify-account-cleanup.mjs`
   against the explicitly selected Dev target with `CONFIRM_DEV_WRITE_TEST=yes`. They use
   rolled-back fixtures and verify runtime isolation, constraints, sessions and cleanup. Run
   `npm test`, `npm run typecheck`, `npm run build` and the browser suite before release.
5. Deploy the API, then the web application through the existing environment workflows. The
   workflows do not apply SQL migrations; applying 013 is an explicit prerequisite. Refresh
   the portal, sign in with a disposable authorized client account, create an assessment,
   answer questions, save and reopen. Test a no-Microsoft client, viewer denial, a second
   client's access denial, database-specific questions and a stale revision conflict.
6. Remove temporary operator firewall access in finally/cleanup, including on validation failure.

Rollback application code to the prior build while retaining these additive tables/data. Do not
drop answers, undo account verification or edit migration history. If 013 fails, the migration
runner rolls back its transaction; fix the unapplied script and retry after validation. After
application, correct schema issues with a new forward migration. Use the target environment's
documented point-in-time recovery process for actual data corruption; preserve/export newer
answers before a restore. Restore procedures still require a disposable rehearsal.

Local checks for this change include T-SQL syntax parsing, API validation tests and browser tests
with mocked responses. No migration application or real SQL/API round trip is implied by those
checks. Record live validation separately when deployment is authorized and performed.
