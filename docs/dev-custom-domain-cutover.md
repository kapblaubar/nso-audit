# Dev custom-domain cutover

Target: `https://auditdev.newsommer.com`, bound to the existing `nso-audit-dev-web`
Static Web App in `NSO-Audit`. Keep existing resource names and the Azure-hosted URL
available during transition. The API remains `nso-audit-dev-api-flex` on its existing host.

GoDaddy CNAME: host `auditdev`, target
`blue-mushroom-0b2666c1e.7.azurestaticapps.net`, TTL 30 minutes. Public DNS was verified.
Azure has a custom-domain entry; its observed status progressed from
RetrievingValidationToken to Adding. Verify domain validity and HTTPS before switching
the frontend callback or email origin. This document does not claim completed cutover.

At the November 9, 2026, 7:10 PM America/Los_Angeles check, Azure still reported Adding
with no errorMessage. A normal HTTPS request failed hostname validation because the edge
served its default Azure platform certificate, whose SANs did not include the custom domain.
The CNAME remained correct; public CAA queries showed no root-domain issuer restriction.
Do not bypass TLS validation or switch application callbacks/email origins while this remains
the observed state. Keep the existing valid Azure URL available until the custom-domain
certificate is provisioned/bound and a normal HTTPS request succeeds.

## Completed CORS preparation

On November 9, 2026, added `https://auditdev.newsommer.com` using the versioned
`scripts/Set-NsoAuditCors.ps1` with the explicit existing Dev subscription/resource target.
It preserved `https://blue-mushroom-0b2666c1e.7.azurestaticapps.net` and left
supportCredentials=false. The script verifies persisted settings and supports -WhatIf.
The desired allowedOrigins array in `infra/api-network.dev.bicepparam` includes both hosts.

A real OPTIONS request to `/api/me/bootstrap` with the custom Origin and requested
Authorization/workspace headers returned 204 and
Access-Control-Allow-Origin: https://auditdev.newsommer.com. No application deployment,
SQL/network/firewall change or credential setting change was needed for this CORS step.
The portal's inability to edit was not diagnosed; CLI application and verification succeeded.

## Account origin repair (November 10, 2026)

Normal HTTPS now returns 200 with certificate validation enabled. The account login
endpoint still returned 403 `Request origin is not allowed.` because its exact-origin
check uses PORTAL_ORIGIN independently of platform CORS. The previous runtime value
was `https://blue-mushroom-0b2666c1e.7.azurestaticapps.net`.

Dev `portalOrigin` now targets `https://auditdev.newsommer.com`. Apply only this runtime
setting with the versioned script (first use `-WhatIf` to inspect the change):

```powershell
./scripts/Set-NsoAuditPortalOrigin.ps1 -SubscriptionId 257f10d8-cb7f-400c-8e29-7f1fc5318247 -ResourceGroupName NSO-Audit -FunctionAppName nso-audit-dev-api-flex -PortalOrigin https://auditdev.newsommer.com
```

This also changes newly generated invitation, verification and password-reset links.
Applied and read-back verified on November 10, 2026. Dev Bicep parameters compiled;
the targeted script's WhatIf showed only the portal-origin update. No Bicep deployment
was applied. A deliberately malformed login request from the custom origin changed
from 403 origin rejection to 400 `Invalid request.`, proving it passed the origin
guard without attempting a user login or modifying account data. An unrelated origin
still returned 403. Actual credential sign-in and Microsoft callbacks remain to be
verified; this is not evidence of a complete domain cutover or clean rebuild.

The application permits only one portal origin: retaining the old host in CORS does
not preserve account or questionnaire POST access there. To roll back, run the same
script with the previous origin and revert the Dev portalOrigin parameter. Existing
data and schema need no migration. Do not redeploy the unreconciled full template.

## Remaining cutover

- Verify the three new SPA redirect URLs for `/auth/callback`, `/clientmanagement` and `/`,
  retaining existing redirects. Use `Set-NsoAuditAppRedirect.ps1` for repeatable additions.
- Record the custom-domain binding in infrastructure code and verify Azure domain/HTTPS status.
- Update Dev public frontend callback to the new `/auth/callback` URL and rebuild/publish.
- Test normal and management sign-in/out, email links, tenant isolation and an audit through
  the custom domain. Keep the API endpoint and approved API-to-SQL subnet unchanged.

Do not deploy the unreconciled legacy platform template for this cutover. Compile relevant
templates and inspect what-if before applying infrastructure. Preserve old host access as
rollback until the new host's application behavior is verified. Future Prod needs separate
domain, environment parameters and identities; do not reuse Dev credentials or data.
