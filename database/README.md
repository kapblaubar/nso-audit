# SQL foundation

The initial backup questionnaire schema, API/form, deployment order and recovery steps are in
[questionnaires.md](questionnaires.md). Apply migration 013 before deploying that feature.
The complete 12-section client questionnaire uses migration 014; see
[client-assessments.md](client-assessments.md) for source-catalog generation, storage, validation,
deployment and recovery. Earlier backup IDs and answers remain available.

The existing `NSO-Audit` resource group is Dev. `infra/sql.bicep` adds SQL independently of the
legacy platform template, preserving the live Function, Static Web App, vault and Storage.
The full legacy template remains unreconciled; do not apply it to live Dev.

SQL is Entra-only: the deployment administrator runs migrations, while the API managed identity
receives only the `nso_runtime` database role. Do not grant the runtime `db_owner`. Portal client
password hashes belong in `identitydata.Users`; management identities belong in
`identitydata.ManagementUsers`. Neither contains a recoverable password or connector secret.
Email registration/login, verification and reset are documented in [customer-accounts.md](customer-accounts.md). The scan-data backfill and
application cutover are documented in [scan-cutover.md](scan-cutover.md). Retain source Tables
as the pre-cutover snapshot; SQL is the destination for active structured scan records.

## Deploy and initialize

1. Use `infra/sql.dev.bicepparam` for existing Dev. For another environment, make a separate
   parameter file with a unique server/database name and its own Entra admin group. Dev uses
   Basic/5 DTU/2 GiB and seven-day local backup retention; Prod capacity, redundancy and recovery
   requirements must be selected explicitly. No Prod environment is deployed by this work.
2. Normal API access uses its dedicated subnet and a SQL VNet rule. Follow
   `../docs/networking-requirements.md` and the deployment runbook. Pass only a temporary exact
   operator IPv4 to `scripts/Deploy-NsoAuditSql.ps1` when required for migrations. Without
   `-Apply` it previews; inspect before applying. For SQL bootstrap before the VNet exists use
   `-BootstrapBeforeApiNetwork`; provision the network afterward. No Azure-wide `0.0.0.0`
   rule is used. Dev's permanent parameters contain no Function worker IPs.
3. Set public configuration `SQL_SERVER=<name>.database.windows.net` and `SQL_DATABASE=<name>`
   in your shell, authenticate with `az login`, then run:

   ```powershell
   node scripts/database.mjs migrate
   $env:SQL_RUNTIME_CLIENT_ID = '<managed identity application/client ID>'
   node scripts/database.mjs bootstrap
   node scripts/database.mjs verify
   ```

4. Re-run `migrate` to verify idempotence. Applied migrations are checksum protected and
   serialized with an application lock. Add a new numbered migration for every schema change.
   Migration values, connection strings with passwords, and access tokens are never printed.
   SQL `CREATE USER ... WITH SID ... TYPE=E` needs the **application/client ID** for a managed
   identity, not its principal/object ID. See Microsoft's
   [contained principal creation guidance](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-user-transact-sql?view=sql-server-ver17#k-create-a-contained-database-user-from-a-microsoft-entra-principal-without-validation).
   For the initial Dev bootstrap's incorrect object-ID SID only, set the correct
   `SQL_RUNTIME_CLIENT_ID` plus the expected old `SQL_RUNTIME_PREVIOUS_OBJECT_ID` and run
   `node scripts/database.mjs repair-runtime`. This explicit repair refuses unexpected IDs,
   ownership, extra grants or role memberships, and recreates only the restricted runtime user
   transactionally. It does not touch customer data. Ordinary bootstrap never repairs silently.
5. Runtime connection code is `apps/api/src/storage/sql.ts`; set SQL configuration through the
   versioned environment configuration script when enabling SQL-backed application endpoints.
   The migration command uses Azure CLI credentials; runtime uses managed identity/default
   credentials and TLS certificate verification.

6. Bootstrap approved staff explicitly with `MANAGEMENT_TENANT_ID` and `MANAGEMENT_OBJECT_ID`,
   then `node scripts/database.mjs bootstrap-management`. This creates only a `setupAdmin` role
   for that Entra principal and does not reactivate a disabled principal. The management API
   additionally requires the configured NewSommer Entra tenant and a verified API access token.
   Configure the Function with `scripts/Set-NsoAuditSqlRuntime.ps1`; it appends only SQL server,
   database, management tenant and environment settings without printing existing values.

7. Remove the temporary operator firewall rule after migration/verification. Its name is
   `allowed-<operator-ip-with-dashes>`; delete only that rule using
   `az sql server firewall-rule delete --subscription <subscription> --resource-group <group>
   --server <server> --name <temporary-rule-name>`. The persistent Dev parameter file retains
   the approved subnet resource ID and no public IPv4 rules. Incremental deployment does not
   remove omitted rules; use the reviewed legacy manifest and retirement script in the runbook.

## Dev validation recorded 2026-10-19

- SQL server `nso-audit-dev-257f10d8`, database `nso-audit-dev`, West US 2: deployed from Bicep.
- Migrations 001 and 002 applied; a repeat migration run reported the schema current.
- Managed identity `nso-audit-dev-identity` provisioned as `nso_api_runtime` with `nso_runtime`.
- Isolation checks passed under the runtime database principal: A cannot read B, missing
  context reveals no organization rows, and cross-organization inserts are blocked.
- Runtime cannot select password hashes, grant memberships, alter RLS or act as database owner.
- Chris's existing NewSommer Entra object was explicitly provisioned as a setup administrator.
- The initial foundation stopped before application cutover. Subsequent scan-data migration
  and deployment validation are tracked in `scan-cutover.md`. Customer management and email accounts are tracked in `customer-management.md` and `customer-accounts.md`.
- Full application build, type check and five tests passed. Bicep compilation passed for both
  the legacy platform and additive SQL entry points. CI validation is defined in
  `.github/workflows/validate-foundation.yml`; it has not yet run on GitHub.

## Isolation and recovery

Organization tables have RLS filter and block predicates. Context must come from server-verified
membership, never directly from a browser organization ID. `withOrganization` pins one pooled
connection in a transaction, sets context and clears it before release. RLS does not protect
against a compromised runtime capable of changing context; API authorization is mandatory.
The authentication and membership catalogs are outside customer RLS and require narrow
authorization procedures before enabling runtime access. The runtime currently cannot read
password hashes or mutate memberships.

`verify` checks A/B read isolation, missing-context denial and cross-organization insert blocking,
and rolls back all test data. Add authorization/session/invitation tests as those endpoints ship.

This is additive: reverting app code leaves legacy scans untouched. Do not automatically drop
SQL or reverse migrations on rollback. Take a restore point/backup appropriate to the release
before destructive changes, use forward repairs, and validate point-in-time restore into a
separate database before relying on the recovery runbook for Prod. A disposable clean rebuild
has not yet been verified.

## Temporary Dev SSMS operator access

Chris is the configured Dev SQL Entra administrator. Connect to
`nso-audit-dev-257f10d8.database.windows.net`, database `nso-audit-dev`, using
Microsoft Entra MFA as `chris@newsommer.com`. Use encrypted connections with certificate
validation. Open only the public IPv4 used by the SSMS machine with
`scripts/Set-NsoAuditSsmsAccess.ps1 -Action Open -OperatorIpv4Address <ip>` to preview,
then repeat with `-Apply`. The script is restricted to the existing Dev target and creates
only `operator-ssms-chris`; it preserves API subnet rules and rejects conflicting rule IPs.
After the session, run the same script with `-Action Close` and the same IP, preview then
`-Apply`, to remove temporary access. This rule does not expire automatically. Keep permanent
SQL parameters free of operator IPs. No schema or infrastructure redeployment is needed.
