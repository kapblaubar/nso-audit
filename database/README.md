# SQL foundation

The existing `NSO-Audit` resource group is Dev. `infra/sql.bicep` adds SQL independently of the
legacy platform template, preserving the live Function, Static Web App, vault and Storage.
The full legacy template remains unreconciled; do not apply it to live Dev.

SQL is Entra-only: the deployment administrator runs migrations, while the API managed identity
receives only the `nso_runtime` database role. Do not grant the runtime `db_owner`. Portal client
password hashes belong in `identitydata.Users`; management identities belong in
`identitydata.ManagementUsers`. Neither contains a recoverable password or connector secret.
Client registration/login and email delivery are not yet implemented. The scan-data backfill and
application cutover are documented in [scan-cutover.md](scan-cutover.md). Retain source Tables
as the pre-cutover snapshot; SQL is the destination for active structured scan records.

## Deploy and initialize

1. Use `infra/sql.dev.bicepparam` for existing Dev. For another environment, make a separate
   parameter file with a unique server/database name and its own Entra admin group. Dev uses
   Basic/5 DTU/2 GiB and seven-day local backup retention; Prod capacity, redundancy and recovery
   requirements must be selected explicitly. No Prod environment is deployed by this work.
2. Obtain the current deployment operator IPv4 and Function outbound addresses. Pass exact IPs
   to `scripts/Deploy-NsoAuditSql.ps1` with subscription, resource group and parameter file.
   Without `-Apply` it performs only what-if. Inspect output before applying. No Azure-wide
   `0.0.0.0` firewall rule is used. Keep required application IPs in the deployment parameters;
   remove temporary operator access when no longer needed. Prod networking needs a dedicated
   review, including private endpoints and the Functions hosting plan.
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
   only the Function outbound IPs. Incremental deployment does not remove old firewall rules;
   review and explicitly retire stale rules when app outbound addresses change.

## Dev validation recorded 2026-10-19

- SQL server `nso-audit-dev-257f10d8`, database `nso-audit-dev`, West US 2: deployed from Bicep.
- Migrations 001 and 002 applied; a repeat migration run reported the schema current.
- Managed identity `nso-audit-dev-identity` provisioned as `nso_api_runtime` with `nso_runtime`.
- Isolation checks passed under the runtime database principal: A cannot read B, missing
  context reveals no organization rows, and cross-organization inserts are blocked.
- Runtime cannot select password hashes, grant memberships, alter RLS or act as database owner.
- Chris's existing NewSommer Entra object was explicitly provisioned as a setup administrator.
- The initial foundation stopped before application cutover. Subsequent scan-data migration
  and deployment validation are tracked in `scan-cutover.md`. Client registration/login and
  workspace management screens remain the next portal increment.
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
