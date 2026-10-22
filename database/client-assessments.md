# Full client assessment questionnaire

Applied Dev migration and live validation: [2026-10-21 deployment record](../docs/client-questionnaire-deployment-2026-10-21.md).

The customer questionnaire implements all 12 question sections in
[the Markdown catalog](../docs/client-assessment-questionnaire-v1.md), under **Client assessment
questionnaire**. Backups is one section. Template `client-v1` contains 124 inputs: every source
question ID, with separate inputs for compound questions and structured supporting lists.

## Markdown to database to form

`docs/client-assessment-questionnaire-v1.md` question tables and reviewed input/group definitions
in `scripts/build-client-questionnaire.mjs` compile to `config/questionnaires/client-v1.json` and
the seed portion of `database/migrations/014_client_assessment.sql`. The schema portion comes
from `database/templates/014_client_assessment.schema.sql`. The API reads SQL definitions; the
form renders their sections, groups, options, units and record fields. It does not read Markdown
at runtime. Source IDs and original source prompts are retained for traceability; these IDs are
internal conventions, not NIST/CMMC identifiers.

Before initial application of 014, use `node scripts/build-client-questionnaire.mjs` to regenerate
and `node scripts/build-client-questionnaire.mjs --check` to verify checked-in outputs. CI checks
the generated artifacts and tests that every Markdown question ID is represented. Once 014 is
applied, freeze its schema/catalog. Future edits require a new template/question version and a
new forward migration; update the compiler output targets and API version support deliberately.
Never regenerate an applied migration to change historical definitions.

## Structure and inputs

Company/scope, network, data protection, incident response, governance and profile intake have
one company-scoped group each. Inventory, backups, identity, endpoints/servers, cloud and AI have
user-added scope groups. Inventory separates managed/unmanaged asset classes; identity supports
administrators and ordinary users; database backup questions appear only for database groups.
Users can add additional groups for different tenants, environments, products or use cases.
No Microsoft connection is required. An unconfigured section explicitly says its scope is not set.

Answers support YN, Status, Coverage, Select, Multi, Date, Text, Number and structured Records.
The last type implements the Markdown's repeating environment, service, supplier, retention-tier,
AI-use-case and reviewer-issue lists. Typed nullable columns store ordinary answers. Records use
a JSON array validated against versioned field definitions; explicit null cells mean Unknown,
and omitted required cells are rejected. Unknown and Not applicable remain separate answer
states; Not applicable requires justification. Multiple choices use a separate relation; None is
exclusive and Other requires explanation. Counts calculate coverage; estimates are explicit and
zero in scope requires applicability review. No automatic grade is produced.

Migration 014 adds `questionnaire.ClientSections`, `questionnaire.ClientQuestionDefinitions`,
`app.ClientAssessmentDetails`, `app.ClientAssessmentGroups`, `app.ClientAssessmentAnswers`,
`app.ClientAssessmentSelections` and `app.ClientAssessmentReviews`. Root assessments reuse
`app.Assessments`. Organization/assessment/group/question version identify an answer. Each client
table has RLS filter and write-block predicates; existing schema permissions protect catalog
definitions from runtime writes. No extra Azure roles or persistent infrastructure are needed.

Existing migration-013 backup tables, IDs, definitions and data remain intact. The list exposes
them under **Earlier backup-only assessments**, where their original answers can be reopened
and edited. They are not silently renamed or merged into new assessments. Start a complete
assessment to use the full catalog; do not automatically reinterpret earlier declarations.

## Save, review and permissions

The browser calls the Function API; only the API accesses SQL over the existing approved subnet.
Email sessions resolve live membership for the explicitly selected organization. Owners, admins
and contributors can enter answers; viewers can read. Owners/admins can record reviewer
conclusions separately from declarations. `PRF-07` is reviewer-maintained; contributor saves
preserve that answer and cannot replace it. Staff/Microsoft login alone grants no customer access.
Answer-owner and reviewer names describe responsibilities and do not grant permissions.

`GET/POST /api/me/client-assessments` lists/creates full assessments; `GET/PUT /{assessmentId}`
reads/updates their details; `POST /{assessmentId}/groups` adds a scope group;
`PUT /{assessmentId}/groups/{groupId}` saves that group's complete editable answer set;
`PUT /{assessmentId}/groups/{groupId}/reviews/{questionId}` records an authorized review.
All routes require the email bearer session and `X-Nso-Organization-Id` header. Responses use
no-store, mutations validate Origin and have a 512 KiB UTF-8 request limit. Body organization IDs
cannot grant access. Every write requires the current revision and a draft assessment, advances
the revision atomically, and appends an audit event. Failed/stale saves roll back and preserve
local edits. Other groups' answers and independent reviewer records are not replaced.

Review stores conclusion, evidence state, collection state, rationale and actions separately.
Grading, formal report approval/snapshots, automated evidence integration, private uploads and
insurer/framework mapping remain separately specified work. This questionnaire collects profile
intake without claiming compliance, certification, insurance acceptance or AI readiness approval.
No submission/approval route exists in this release; mutable drafts are not approved reports.

## Deployment and recovery

Apply migration 014 before new API/web code. No backfill of existing answers is required.
Use `scripts/Deploy-NsoAuditQuestionnaires.ps1` with an explicit Dev subscription, exact operator
IPv4, unique `nso-audit-validation-<8 hex characters>` database name and the existing runtime
client ID. Run without `-Apply`, inspect the Bicep what-if (only a disposable database and exact-IP
operator rule), then repeat with `-Apply`. It preserves the Dev resource names and SQL subnet path.

The wrapper builds the disposable baseline through 013, validates candidate 014 transactionally,
applies it on the disposable database, and verifies new and earlier storage plus account cleanup.
Only then does it migrate Dev, verify repeat migration/checksums, publish API then web, and run
`verify-client-assessment-api.mjs` against the live endpoints and browser. Fixtures use synthetic
clients, no mail delivery or real grants. Finally it removes the disposable database and temporary
operator rule. Verify public SQL rules are empty, the subnet rule is Ready and SQL-backed health
is healthy after cleanup. This is feature validation, not a full platform/Prod rebuild rehearsal.

Local checks: catalog `--check`, `npm test`, `npm run typecheck`, `npm run build`, and the Playwright
suite. SQL checks: `verify-client-assessments.mjs --validate-migration` on a disposable 013 baseline;
after application run that script without the flag plus `verify-questionnaires.mjs` and
`verify-account-cleanup.mjs`, with explicit targets and `CONFIRM_DEV_WRITE_TEST=yes`.

Rollback API/web builds without dropping new tables or changing migration history. Older builds
can still use earlier backup data but cannot display the new full assessments. Retain their data
until restoring the compatible build. Correct applied schema issues through a forward migration.
For actual data corruption follow the environment's point-in-time recovery procedure, preserving
newer responses before restore; restore rehearsal remains required independently.
