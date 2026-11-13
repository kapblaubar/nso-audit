# Defender for Endpoint scores and recommendations

Apply migration `020_endpoint_scores.sql` after 019 and before deploying API and web.
It adds three organization-isolated snapshot tables, composite foreign keys, row security
filter/block predicates and collection types. Existing evidence is retained without backfill.
The worker uses the customer tenant credential with the separate
`https://api.security.microsoft.com/.default` audience. No new Azure resource, secret or
network path is required. Preserve Dev names and the approved API-to-SQL VNet path.

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

- [Exposure Score](https://learn.microsoft.com/en-us/defender-endpoint/api/get-exposure-score)
- [Secure Score for Devices](https://learn.microsoft.com/en-us/defender-endpoint/api/get-device-secure-score)
- [Recommendations](https://learn.microsoft.com/en-us/defender-endpoint/api/get-all-recommendations)
