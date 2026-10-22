# Full client questionnaire Dev deployment — 2026-10-21

## Delivered

The customer workspace opens **Client assessment questionnaire** with all 12 Markdown question
sections and 124 typed inputs. Backups is one section. Repeating asset/environment/use-case
groups and structured lists are supported. Declarations, evidence references and reviewer
conclusions are stored separately. Earlier migration-013 backup assessments retain their IDs,
questions and answers under **Earlier backup-only assessments**.

The Markdown question tables and reviewed input definitions compile into the checked-in
`client-v1` catalog and migration 014. Every source question ID and original source prompt is
verified by tests. The live form reads versioned SQL definitions through the Function API.

## Applied and verified

- Inspected Bicep what-if: only a disposable Basic database and an exact-IP operator rule were
  created. Existing Dev resource names, server configuration, VNet, runtime identity and apps
  were preserved. No full foundation redeployment was attempted.
- Rebuilt a disposable 013 baseline, validated candidate 014 transactionally, applied 014 there
  and verified both full-client and earlier-backup storage plus account cleanup.
- Applied migration 014 to `nso-audit-dev`; repeat migration/checksum verification reported
  schema current. Runtime checks passed for RLS, group separation, typed values, records,
  multi-selection, independent reviews, catalog protection and revisions.
- Account cleanup preserved full-client answers/reviews and earlier answers while removing a
  synthetic login and its credentials/sessions. Fixtures and candidate test transactions rolled back.
- Published API to `nso-audit-dev-api-flex`, then web to `nso-audit-dev-web`. The legacy API was
  not redeployed. SQL-backed API health passed.
- Live API checks passed for all 12 sections / 124 questions, every repeatable section family,
  all input types, distinct endpoint/database answers, records, invalid/stale-save rollback,
  viewer/client isolation, reviewer-only questions and independent reviewer conclusions.
- Live deployed-browser checks passed: all 12 navigation sections, edit/save/reopen of company
  answers, switching endpoint/database groups with different answers, and access to the original
  backup-only assessment. Test client had no Microsoft connection. A browser assertion was
  corrected to wait for asynchronous assessment loading, then the full live verification passed.
- Local validation passed: 31 API tests, 18 browser tests, repository typecheck/build, catalog
  consistency, T-SQL syntax parsing and script syntax checks.

Synthetic client/account data was removed; no email was sent and no real client permissions were
granted. The disposable database and temporary operator access were removed by the wrappers.
Final post-cleanup checks confirmed SQL-backed API health is healthy, public SQL firewall rules
are empty, only the original Dev database and master remain, and the API subnet rule is Ready.
`Test-NsoAuditApiNetwork.ps1 -Suite ClientAssessments` can repeat live API/browser verification
without redeploying; it opens and removes only temporary exact-IP SQL operator access.

## Open the form

Refresh https://blue-mushroom-0b2666c1e.7.azurestaticapps.net/signin and use an authorized client
email login. Choose **Questionnaire**, then create a **client assessment** to get the complete
catalog. Scope groups are added inside each relevant section. Save drafts per group and reopen
the same assessment to continue. Earlier entries remain available separately.

Automatic grading, reviewed insurer/framework mappings, private uploads and approved report
snapshots remain future work as described in the requirements. This validates the questionnaire
feature in Dev; it does not prove a full Prod rebuild, compliance or an actual customer restore.

Storage, source generation, deployment order and recovery: [client-assessment runbook](../database/client-assessments.md).
