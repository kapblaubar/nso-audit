# Technology-specific questionnaire (client-v3)

Section 2 is a technology register with seven asset types. Each entry is explicitly one
system or a group of similar items. Single items receive direct inventory/support
questions; groups receive coverage measurements. Four additional questions are selected
by asset type. Business purpose, business owner, technical manager and verification date
are shared questions. Unknown answers remain available.

New assessments use client-v3 automatically, with no version checkbox. The API also defaults
to v3 when no template is specified, including requests from a cached earlier web page.
Existing assessments stay on their original catalog, with all answers and reviews intact;
earlier versions display a notice explaining this. Create guided copy still targets v2 from
v1; v3 copying is deliberately unavailable until context conversion is defined. Explicit
v2 creation remains supported for compatibility and historical verification, but is not
offered in the normal new-assessment flow.

## Versioning and deployment

Migration 016 adds client-v3/question version 4 only. It does not alter existing catalogs,
tables, identities, networking or infrastructure. No Bicep change is required. No database
rebuild or customer data migration is needed. Generator:
`node scripts/build-technology-questionnaire.mjs` (`--check` validates checked-in outputs).

Before release, run catalog checks, typecheck, API tests, build and the client-assessment
Playwright suite. Inspect the questionnaire deployment wrapper what-if: only the disposable
validation database and temporary exact-IP operator access are expected. Validate candidate
016 transactionally on a disposable database rebuilt through 015, then apply and verify
old and new catalog isolation and answer persistence under the runtime identity before
applying 016 to Dev. Do not infer SQL validation from local tests or compilation.

The questionnaire wrapper validates candidate 016 transactionally after rebuilding through
015, applies 016 to the disposable database, and runs `verify-technology-questionnaire.mjs`
before migrating Dev. It repeats installed-catalog verification on Dev. Use the same explicit
Dev arguments as the guided-intake runbook; preview first, then `-Apply`. `-DatabaseOnly`
stops after SQL validation and cleanup when application publication is separate. Publish API after
016, then web. Verify all seven asset types and both entry kinds, save/reopen, cross-customer
and viewer restrictions, and historical v1/v2 reads. Keep normal SQL access on the approved
API subnet; remove temporary operator access after verification.

Recovery: roll back API/web artifacts if necessary; retain additive 016 and v3 data. Earlier
APIs cannot open v3. Restore service with a compatible API rather than downgrading answers
or deleting the new catalog. Recover accidental data loss into a separate database and use
a reviewed forward repair.

## Follow-up work

Reuse systems/providers from company intake, link technology entries to other sections,
and offer reviewed migration/copying from existing assessments. These are not implemented
in this first increment. Reviewer controls already remain collapsed per question.

`verify-client-assessment-api.mjs` also exercises v3 in its synthetic workspace, including
all fourteen type/kind combinations and the deployed database/laptop browser flow. The parent
verifier removes its synthetic clients and account in `finally`; no email is sent. Existing
v1/v2 and earlier backup checks run in the same suite. The network test wrapper provides
temporary exact-IP access when running these checks separately from deployment.

Status: deployed and verified in Dev on 2026-10-28. See the
[deployment record](technology-questionnaire-deployment-2026-10-28.md) for validation,
cleanup, limitations and instructions for trying the new forms.

Other questionnaire sections use question cards that start collapsed. Select a question title to expand it, or use Expand all
questions / Collapse all questions for the current group. Expansion is retained while
saving and switching sections in the open questionnaire. Incomplete required answers
reopen for validation. This is a web-only presentation change for all full-client catalog
versions; it requires no schema, infrastructure or answer migration. Roll back the web
artifact if necessary; saved answers are unchanged.

## Simple technology cards

The v3 technology section now uses one About [system] form card with short field labels,
two desktop columns and a single mobile column. Yes/No, Not sure and Not applicable are
choices in the same select; text fields may be left blank. Common text suggestions do not
restrict existing/custom answers. A blank remains missing evidence, never an inferred pass.

Reviewer view is separate from the customer form, retains existing authorization and
records conclusions independently. Show notes and answer options exposes preserved notes,
evidence references and explicit states without repeating them on the primary form.
Read-only users can inspect notes while all answer controls remain disabled.

This first layout pass applies to all seven v3 technology types and existing v3 assessments.
Other sections and older catalogs retain their current forms. No questions, answers, IDs,
review records or catalog definitions are migrated or combined. The API/SQL contract and
infrastructure are unchanged; publish only the web app with existing Dev public settings.
Rollback can restore the previous web artifact without changing saved answers.
