# SQL foundation

The existing `NSO-Audit` resource group is Dev. `infra/sql.bicep` adds SQL independently of the
legacy platform template, preserving the live Function, Static Web App, vault and Storage.
The full legacy template remains unreconciled; do not apply it to live Dev.

SQL is Entra-only: the deployment administrator runs migrations, while the API managed identity
receives only the `nso_runtime` database role. Do not grant the runtime `db_owner`. Portal client
password hashes belong in `identitydata.Users`; management identities belong in
`identitydata.ManagementUsers`. Neither contains a recoverable password or connector secret.
This migration creates the foundation tables; registration/login and email delivery are not yet
implemented. Existing scans remain in Tables until a validated backfill and application cutover.

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
   $env:SQL_RUNTIME_OBJECT_ID = '<managed identity principal/object ID>'
   node scripts/database.mjs bootstrap
   node scripts/database.mjs verify
   ```

4. Re-run `migrate` to verify idempotence. Applied migrations are checksum protected and
   serialized with an application lock. Add a new numbered migration for every schema change.
   Migration values, connection strings with passwords, and access tokens are never printed.
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
- SQL connector and management bootstrap endpoint compile locally but have not been deployed
  to the Function. The existing frontend and Table-backed scan path remain active. Client
  registration/login and workspace management screens are the next implementation increment.
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
