# Technology questionnaire Dev release — 2026-10-28

## Database validation and migration

Reviewed the `infra/sql-validation.bicep` what-if for explicit Dev targets. It showed
two creations only: `nso-audit-validation-20261028` (Basic SQL database) and its
exact-IP operator rule. Existing Dev resources, names, runtime identity and API subnet
were preserved. No shared foundation redeployment was attempted.

The versioned questionnaire wrapper rebuilt the disposable database through 013,
bootstrapped the restricted runtime identity, validated 014 transactionally, applied 014,
validated 015 transactionally, applied 015, and validated candidate 016 transactionally.
It then applied 016 on the disposable database and verified the installed catalog.

The new verifier checked all 12 sections and 151 question definitions, all seven
technology types with both individual/group contexts, type-specific applicability,
fourteen independent runtime answer round trips, missing-context SQL row isolation,
and unchanged v1/v2 question definitions. Existing questionnaire and account-cleanup
checks passed. Fixtures and candidate changes were rolled back.

Only after disposable checks passed, migration 016 was applied to `nso-audit-dev`.
Repeating the migration runner confirmed checksum/idempotence. New and historical
questionnaire verifiers and account-cleanup checks passed on Dev.

The wrapper removed its disposable database and operator rule. Independent inspection
confirmed only Dev/master remain. The pre-existing exact-IP `operator-ssms-chris` rule
was preserved; it is separate from this release and should be removed when its operator
session is finished. Normal API SQL access remains through the approved subnet.

## Application publication and live verification

Published the API using `Publish-NsoAuditApi.ps1` to `nso-audit-dev-api-flex`, followed by
`Publish-NsoAuditWeb.ps1` to `nso-audit-dev-web` with `config/environments/dev.public.json`.
The legacy API was not redeployed. SQL-backed runtime health passed. The local ignored API
artifact is `.azure/releases/api-technology-20261028.zip`.

`Test-NsoAuditApiNetwork.ps1 -Suite ClientAssessments` passed the full deployed suite:

- Existing guided questionnaires, all repeatable section families, typed answers, revisions,
  cross-workspace access checks, viewer restrictions, independent reviews and preserved
  earlier backup assessments.
- Guided copies preserve source answers/reviews and reject stale or unauthorized sources.
- V3 creation and all seven technology types with both individual/group contexts, all four
  type-specific text answers, coverage values, independent save/reopen, rejection of answers
  for the wrong type or entry kind, stale-save rejection and viewer restrictions.
- The deployed browser shows the opt-in checkbox, displays database-specific questions,
  saves a database-platform answer, switches to laptop group coverage questions, then
  reopens the database answer after a full page reload. Mobile width passed. Screenshot:
  local ignored `.azure/browser-results/technology-questionnaire-live.png`.

Two initial browser attempts exposed verifier mistakes: the fixture had not populated the
platform answer being asserted, and the reload assertion expected the workspace page even
though the application restores the questionnaire listing. Corrected those test assumptions;
the full final run passed without application changes. Every attempt removed its synthetic
clients/account and temporary exact-IP rule. No mail was sent or real customer access granted.

Local typechecks, build, 35 API tests, catalog consistency and script syntax checks passed.
The earlier local questionnaire browser checks covered all 13 scenarios after selector fixes.

## Trying the new forms

Open https://blue-mushroom-0b2666c1e.7.azurestaticapps.net/signin, choose Questionnaire,
and start a **new assessment**. New assessments automatically use the revised questions;
there is no version checkbox. Section 2 is **Your technology and who manages it**. Add **NSO DB** as one
database, or **Office laptops** as a group of computers/mobile devices, to compare the
questions. Existing assessments retain their original forms; they are not silently upgraded.

## New-assessment default correction

The initial release left v2 as the default behind an unchecked opt-in, so a newly created
assessment could still have the generic asset questions. The correction removes the checkbox,
requests v3 for new assessments, and makes v3 the API default when a cached client omits the
template. Legacy guided copies retain their v2 target. Older assessments display a clear
notice; their saved data and immutable question versions are preserved.

No schema or infrastructure change is needed: migration 016 is already installed. Local
typechecks, 36 API tests and all 14 questionnaire browser tests passed, including the normal
create-assessment flow without an opt-in. The live verifier now creates v3 through the API
without a template and through the browser's normal new-assessment form.

Published the correction to the existing Dev API, then the Dev web app with the same
versioned publication scripts. The retained ignored API artifact is
`.azure/releases/api-technology-default-20261028.zip`. The full live client-assessment
suite passed, including default v3 creation with no template in the API request and
creation through the normal browser form with no checkbox. Database save/reopen,
laptop-group switching, full-page reload persistence, mobile width and the historical
questionnaire checks passed. Synthetic clients/account and temporary operator access
were removed; no mail was sent.

## Collapsible question cards

Added native keyboard-accessible details/summary cards, closed by default, with Expand all
questions and Collapse all questions controls for the active group. Expansion is kept in
page state across saves and section/group navigation; answers remain independent of it.
Required-field validation reopens incomplete collapsed answers. This applies to existing
full-client assessments as well as new ones. No API, SQL or infrastructure deployment is
required; rollback consists of restoring the previous web artifact.

Web typechecking and the 15-questionnaire-scenario browser suite passed. A further focused
check confirmed that saving an incomplete collapsed coverage answer reopens it for validation.
Published to the existing Dev Static Web App using the versioned web publication script.
The full live client-assessment verifier passed, including default-collapsed cards,
individual expansion, collapse-all, retained expansion on save, persisted database answers,
group switching, full reload and mobile width. Historical questionnaire checks also passed.
Synthetic clients/account and the temporary exact-IP SQL rule were removed; no mail was sent.

## Simple technology form cards

The next presentation pass replaces individual question cards in the v3 technology section
with one About [system] form, short labels and ordinary fields. Common Yes/No/unknown states
are integrated in the select controls; notes and evidence references are optional. Reviewer
view is a separate, authorized view using the existing independent review endpoint. Existing
values and catalog versions are preserved, including custom text, false answers, explicit
unknowns, not-applicable reasons and measurement metadata.

This is the first section using the simplified layout; other sections retain their current
forms. Smaller page headings reduce unused space. It is a web-only release with no API,
database, networking, identity or Bicep changes. Deploy using the existing web publication
script and public Dev configuration. Rollback restores the previous web presentation and
retains all saved data.

Web typechecking and the 17-scenario questionnaire suite passed. Focused final checks also
verified the final card layout, reviewer-view round trips, mobile width and read-only note
access. The test setup now waits for assessment loading before expanding legacy question
cards, eliminating the earlier timing race. Desktop/mobile previews are local ignored files
`.azure/browser-results/simple-technology-desktop.png` and `simple-technology-mobile.png`.

Published with the existing Dev web publication script and public configuration. The full
live client-assessment suite passed: existing questionnaires and reviews, all seven v3
technology types and both entry kinds, simple form save/reopen through the deployed browser,
switching database/laptop entries, full reload persistence and mobile width. The live form
contains one technology card and no repeated reviewer controls. Synthetic accounts/data and
the temporary operator rule were removed; no email was sent or real customer data modified.

## Recovery and limits

Retain additive migration 016 and v3 answers if application artifacts need rollback.
Earlier APIs cannot open v3 assessments; restore with a compatible API. Existing v1/v2
assessments remain available, with their original answers/reviews. No customer-data
conversion or existing database rebuild is performed.

This is an additive Dev feature release, not a proof that the full platform or Prod
can be rebuilt. Cross-section technology reuse and conversion of old assessments to
v3 remain future work. See [technology register runbook](technology-register.md).
