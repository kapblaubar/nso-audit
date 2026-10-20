# Project requirements for contributors

- The existing Azure `NSO-Audit` resource group is the Dev environment. Preserve its current
  resource names unless an explicitly planned migration requires changing them.
- Maintain infrastructure as code alongside every infrastructure-dependent application change.
  Use the shared Bicep templates under `infra/`, environment-specific parameters, and versioned
  scripts for configuration that Bicep cannot manage. Do not leave required portal-only steps
  undocumented or treat manual live changes as the source of truth.
- Design for separate Dev and future Prod environments. Parameterize names, locations, capacity,
  endpoints and identity configuration. Keep data, credentials and deployment targets isolated;
  do not copy Dev identities, secrets or customer data into Prod.
- Keep database schema migrations versioned with the application. Document deployment order,
  validation, data migration and rollback/recovery for changes that require them.
- Keep deployment workflows and `docs/deploy-from-scratch.md` current. Validate relevant
  templates and migrations before deployment, inspect infrastructure what-if output, and
  distinguish successful compilation from a verified clean deployment.
- Never commit credential values, private keys or deployment tokens to templates or parameter
  files. Use managed identity and secure bootstrap/secret references.
- The existing Bicep is not yet reconciled with the live Dev configuration. Do not assume that
  redeploying it will preserve current resources. Reconcile naming and configuration before
  applying it, and prove the rebuild process in a disposable environment before claiming that
  Prod can be recreated from code.

- Normal API-to-SQL access must use the approved VNet subnet path; do not repair deployed
  applications by accumulating changing Function worker IPs. Keep operator firewall access
  temporary and exact-IP. See docs/networking-requirements.md for the hosting migration and
  future Front Door origin/forwarded-header requirements.
