# Dev API networking validation - 2026-10-20

## Applied changes

- Incremental `nso-audit-api-network` deployment succeeded after inspected what-if: dedicated
  `nso-audit-dev-vnet` / `api-integration` subnet, Flex plan `nso-audit-dev-flex-plan`, API
  `nso-audit-dev-api-flex`, private deployment container, SQL VNet rule. Microsoft.App registered.
- Existing SQL, identity, storage, Key Vault, SWA names and customer data preserved. The legacy
  API is retained for controlled rollback; no data/schema migration was required.
- Existing runtime identity uses the same restricted SQL role; no SQL password or db_owner grant.
- Candidate code deployed, then website deployed with the Flex API URL. Live frontend asset was
  fetched and verified to reference the new API.
- All 20 historical worker IPv4 firewall rules removed using the reviewed manifest. Final public
  SQL firewall rule list is empty; SQL VNet rule is Ready and matches the API integrated subnet.
- Dedicated `nso-audit-dev-deploy` identity provisioned from Bicep after inspected what-if.
  GitHub OIDC trust is pinned to `kapblaubar/nso-audit` environment `development`, with Website
  Contributor only on the Flex API. Public GitHub environment variables verified. Workflow
  changes are local and await commit/push; the revised workflow has not run yet.
- No Front Door or NAT gateway deployed. Flex is on demand with no always-ready instances.

## Completed checks

- API tests: 17 passed; repository typecheck and web build passed.
- Browser entry/management tests: 8 passed (mocked backend, not a live staff browser session).
- Relevant Bicep templates/parameter files compiled; PowerShell scripts parsed; git diff check passed.
- Live SQL-backed health succeeded before cutover and after API restart.
- Disposable live API test passed before cutover and again after retirement of worker-IP rules
  and restart: login/session reads, session writes, password reset/token consumption and replay
  protection, session revocation/logout, organization isolation, staff-route denial and viewer
  write denial. Fixtures cleaned; temporary operator exact-IP rule removed in finally. No mail sent.
- Repeat network what-if inspected: only default/read-only normalization and existing template
  settings, no resource deletions. This is not evidence of a full clean platform rebuild.

## Limits and follow-up

The actual Chris staff browser sign-in/customer Save still needs user confirmation after refresh.
A complete scan and customer connector consent were not rerun. No real customer access grants
or test-login deletions were performed. Future Prod requires separate identities/data/parameters
and a disposable full foundation rebuild/restore rehearsal. Front Door's optional gate has unit
coverage and template compilation; an actual Front Door deployment has not been tested.

Deployment and rollback commands are maintained in `deploy-from-scratch.md`; approved network
and future Front Door requirements are in `networking-requirements.md`.
