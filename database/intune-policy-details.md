# Intune policy detail collection

Deployed and verified in the existing Dev database; see the
[November 10 source collection record](../docs/intune-data-dev-deployment-2026-11-10.md).

Migration 019 and collector `tenant-data-v2-intune` add seven datasets to the existing
17, using pages 5–9 of the supplied example report as a coverage reference. No sample
customer values are copied into fixtures. This adds evidence, not CMMC certification
or a validated control mapping.

| Dataset | Dedicated table | Source |
| --- | --- | --- |
| Settings catalog policy inventory | AuditSettingsCatalogPolicies | beta/deviceManagement/configurationPolicies |
| Settings and definitions | AuditSettingsCatalogSettings | each policy/settings?$expand=settingDefinitions |
| Settings catalog assignments | AuditSettingsCatalogAssignments | each policy/assignments |
| Full configuration properties | AuditDeviceConfigurationDetails | v1.0/deviceManagement/deviceConfigurations/{id} |
| Configuration assignments | AuditDeviceConfigurationAssignments | each configuration/assignments |
| Full compliance properties | AuditCompliancePolicyDetails | v1.0/deviceManagement/deviceCompliancePolicies/{id} |
| Compliance assignments | AuditCompliancePolicyAssignments | each compliance policy/assignments |

Preserves policy platform/type, descriptions and source timestamps; nested setting values,
setting definitions/option labels; platform-specific compliance requirements; included and
excluded targets, group IDs and assignment filters. Child tables retain queryable parent ID,
child ID, setting definition ID, target type, group ID and filter ID/type, plus sanitized full
source JSON. Each child has a composite foreign key to its policy in the same organization,
tenant and audit. Evidence is displayed in existing audit dataset tables with parent IDs.

All Devices/All Users are labeled. Group IDs are preserved without name resolution because
the existing permission policy excludes Group.Read.All. No new permissions or consent grants
are made. Uses existing DeviceManagementConfiguration.Read.All and tenant Intune licensing.
Settings catalog uses Microsoft's beta API; preserve response data and surface API failures.
Do not infer a friendly value when definitions are unavailable. Expanded definition pagination
is explicitly rejected as incomplete rather than silently truncating evidence.

Policy inventory must finish before related jobs can run. Each child page stores evidence
and a bounded parent/page cursor atomically. A final pass verifies parent completeness.
Empty success differs from missing access. A child-source failure terminates that dataset,
retaining earlier pages as partial when rows exist; other datasets continue independently.
This version does not resume past an individually failing policy within that dataset.
Encrypted custom/secret values are redacted. It does not request secret-value decryption.

## Deployment and recovery

1. Run API tests and the web build. The user explicitly authorized direct schema
   updates to the existing Dev database (`nso-audit-dev`) for this work. Dev is the
   application environment, not a temporary test database.
2. Apply 019 to Dev with `scripts/database.mjs migrate --through=019_intune_policy_details.sql`
   before publishing the API. Repeat migration to verify checksums/idempotence.
   Existing snapshots are not backfilled. Use only a temporary exact operator-IP
   firewall rule for migration access and remove it afterward.
3. Run `scripts/verify-intune-dev.mjs` with the Dev SQL_SERVER and SQL_DATABASE to
   verify seven tables, RLS predicates and trusted foreign keys.
4. Publish API, then web with the versioned scripts and existing Dev parameters.
   Existing DATA_AUDITS_ENABLED and VNet SQL configuration remain in effect.
5. Run `scripts/verify-intune-dev.mjs --start` to queue a real audit for the existing
   approved Dev tenant/subscription. Inspect it using `--scan=<returned-id>`. Verify
   all seven statuses/counts and source details. Do not equate builds with collection.

The isolated SQL fixture test `scripts/verify-intune-audits.mjs` is an optional future
regression tool; never point it at Dev. It was not run for this deployment. A separate
validation database was initially provisioned, then removed following the user's
clarification to proceed directly in Dev. No application data was placed there.

Recovery: preserve migration 019 and evidence; do not drop tables or reverse old migrations.
Disable collection through the existing runtime script if necessary. Before reverting API
code, drain new jobs or keep the v2 worker until they finish: the old worker does not know
the seven new types. Completed prior snapshots remain readable in the current API. Future
Prod uses separate environment targets/identities; this is not a clean Prod rebuild claim.

Source contracts: [settings collection](https://learn.microsoft.com/en-us/graph/api/intune-deviceconfigv2-devicemanagementconfigurationsetting-list?view=graph-rest-beta),
[setting definitions relationship](https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfigv2-devicemanagementconfigurationsetting?view=graph-rest-beta),
[configuration policies](https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfigv2-devicemanagementconfigurationpolicy?view=graph-rest-beta),
[compliance assignments](https://learn.microsoft.com/en-us/graph/api/intune-deviceconfig-devicecompliancepolicyassignment-list?view=graph-rest-1.0).
