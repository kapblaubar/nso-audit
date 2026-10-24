# Dev deployment repair - 2026-10-23

The GitHub push succeeded, but Deploy API run 40042937881 failed before publication
at azure/login with AADSTS700213. Deploy web and repository validation succeeded.
The earlier Bicep correction was committed, but its deployment had not been applied
to Azure. The live federation still trusted the old repository-name-only subject.

## Applied infrastructure repair

Ran Set-NsoAuditGitHubApiDeployment.ps1 in preview mode, inspected what-if, and then
applied the existing github-api-deployment.dev.bicepparam with the same script.
What-if showed the expected federation subject change and a symbolic principalId
reference on the existing app-scoped role. Confirmed the referenced deployment
identity principalId matches the existing role before applying. No runtime roles,
SQL permissions or customer identities changed.

Verified the live github-environment federated credential now has subject
`repo:kapblaubar@95560298/nso-audit@1333451275:environment:development`, issuer
`https://token.actions.githubusercontent.com`, and audience `api://AzureADTokenExchange`.
The existing deployment identity and Function app names were preserved. The script
also refreshed the three public GitHub development environment identity variables.

## Applied database prerequisite

Inspection found migration 015 absent and zero client-v2 question definitions.
Added a DatabaseOnly option to the existing questionnaire deployment wrapper so SQL
can be prepared independently before a GitHub-driven application release.

Previewed and applied the wrapper with explicit Dev subscription, existing runtime
client ID, operator IPv4 20.69.173.49, and disposable database
nso-audit-validation-20261023. What-if showed only the disposable Basic database
and its exact-IP operator rule. No existing application database was rebuilt.

Disposable validation applied through 013, bootstrapped the restricted runtime,
validated 014 transactionally, applied through 014, validated candidate 015
transactionally, migrated through 015, and passed old and guided questionnaire
storage, row isolation, revisions and account-cleanup checks. It then applied 015
to nso-audit-dev, repeated the migration runner for checksum/idempotence, and
passed the same verifiers against Dev. Verification fixtures were rolled back.

The wrapper removed the disposable database and its generated operator rule.
Independent inspection confirmed only the existing Dev/master databases and the
separate exact-IP operator-ssms-chris rule remain. The latter belongs to the user's
ongoing SSMS session; remove it when that session ends. API SQL access remains via
its approved subnet.

## Application release

Reran the failed Deploy API run 40042937881 after the two prerequisites succeeded.
Attempt 2 succeeded: build/tests, Azure OIDC sign-in, Function publication and SQL-backed
runtime health all passed. Run: https://github.com/kapblaubar/nso-audit/actions/runs/40042937881.

The synthetic deployed-API verifier passed all 12 sections / 121 guided questions,
repeatable scopes, typed inputs, record persistence, revisions, client/role isolation
and independent reviews. The first browser pass timed out waiting for the section
navigation immediately after deployment; a repeat of the full verifier passed.
Added page-error/body/screenshot diagnostics for future browser-navigation failures.
The successful browser pass saved/reopened company answers, switched independent
endpoint/database scopes, and opened preserved backup-only assessments.

The live guided-copy checks passed: legacy source values/reviews unchanged, duplicate-named
backup scopes remained distinct, and stale-source and cross-workspace requests were rejected.
Both verifier attempts removed their synthetic clients/account and sent no mail.
No additional GitHub push is required to activate the live identity/database repairs.

This repair does not prove a clean full-platform rebuild or Prod recovery.
