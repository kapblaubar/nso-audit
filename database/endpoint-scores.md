# Defender for Endpoint scores and recommendations

Apply migration `020_endpoint_scores.sql` after 019 and before deploying API and web.
It adds three organization-isolated snapshot tables, composite foreign keys, row security
filter/block predicates and collection types. Existing evidence is retained without backfill.
The worker uses the customer tenant credential with the separate
`https://api.securitycenter.microsoft.com/.default` audience. No new Azure resource, secret or
network path is required. Preserve Dev names and the approved API-to-SQL VNet path.

The WindowsDefenderATP consent is associated with the `api.securitycenter.microsoft.com`
resource. The collector uses that host for both API requests and the token scope. Requesting
`api.security.microsoft.com/.default` produced a token without the granted Defender roles in
Dev and returned 403 for all three feeds. A direct test with the corrected audience returned
200 for exposureScore, configurationScore and recommendations on November 13, 2026.
See Microsoft's [API authentication guidance](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-create-app-webapp).

Separately, direct Microsoft Graph Secure Score and control profile calls returned HTTP 504
after approximately 30 seconds on November 13, 2026 at 22:20 UTC, while a Graph organization
request with the same app token returned 200. Request IDs were
`d1b0f160-ac14-4d2e-91ff-46d707ef4dac` and `31ec78a9-78d7-40d5-8c5c-e71b780a967f`.
This is evidence of upstream timeouts, not missing Defender consent. The collector now
distinguishes request timeouts/HTTP 504 as `sourceTimeout` from other source failures.

## Deployment and validation

1. In a disposable database migrated through 019, run
   `node scripts/database.mjs migrate --through=020_endpoint_scores.sql` with that environment's
   `SQL_SERVER` and `SQL_DATABASE`. Verify new table constraints and organization isolation,
   including cross-organization read and write rejection.
2. Back up the target database, then apply 020 using the same versioned runner. Deployment
   workflows do not automatically apply SQL migrations.
3. Configure the target app registration using `scripts/Set-NsoAuditApiPermissions.ps1`
   with its environment-specific parameters and `-IncludeDefenderVulnerabilityManagement`.
   Obtain customer tenant admin consent for WindowsDefenderATP `Score.Read.All` and
   `SecurityRecommendation.Read.All`. Relevant Defender licensing is required. Preserve Graph
   permissions; isolate identities, consent and SQL targets between environments.
4. Deploy API, then web through existing workflows. Run a new tenant audit.
5. Verify `exposureScores`, `deviceSecureScores` and `endpointRecommendations` statuses,
   timestamps, pagination and values against Defender. The tabs show Active recommendations
   with positive `exposureImpact` or `configScoreImpact`, respectively, sorted by impact.
   Score zero is valid. Display source values without assuming a score maximum.
   Check missing access, failed collection, empty results and older audits separately.

## Recovery

Roll back API and web together. Retain additive tables and the expanded collection constraint;
do not delete evidence or alter migration history. The runner wraps migrations in transactions.
After correcting permissions or licensing, start a new audit; do not rewrite historical snapshots.

Local compilation and fixture tests do not establish successful SQL migration execution,
tenant consent or live collection. Record those results separately during deployment.

## Source contracts

Dev migration record, November 13, 2026: migration 020 was applied to `nso-audit-dev`
on `nso-audit-dev-257f10d8` using the versioned runner. The migration ledger records
`2026-11-13T22:00:28.338Z`. All three tables were verified with three organization
isolation predicates and one enabled, trusted audit foreign key each. This confirms schema
installation; Defender consent and live source collection were not verified in this step.

Subsequent November 13 verification: both WindowsDefenderATP application roles were already
granted. Correcting the token audience required no permission, identity or firewall changes.
API deployment `96d08f0f-291f-4c3e-a671-20bf8b9ddf72` completed successfully using the
versioned publish script, and the web publish script deployed the status/layout fixes to Dev.
All 59 API tests passed. Browser fixture checks passed locally and against
`https://auditdev.newsommer.com`; these used intercepted synthetic API responses.
Real audit `c506557d-a158-49da-93cc-92eac192dec3`, created at 22:27 UTC, independently
verified the deployed worker: exposureScores and deviceSecureScores each completed with one
saved snapshot, and endpointRecommendations completed with 84 records. Secure Scores failed
with `sourceTimeout`; Secure Score profiles were still running at the last inspection. The
overall audit was not yet finished. These results do not establish a successful Secure Score
collection or a clean environment rebuild. Historical failed audits remain unchanged.

- [Exposure Score](https://learn.microsoft.com/en-us/defender-endpoint/api/get-exposure-score)
- [Secure Score for Devices](https://learn.microsoft.com/en-us/defender-endpoint/api/get-device-secure-score)
- [Recommendations](https://learn.microsoft.com/en-us/defender-endpoint/api/get-all-recommendations)
