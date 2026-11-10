# Audit-data navigation fix: Dev, November 9, 2026

Opening `/audit-data` without a selected workspace lost its destination when **Open workspace**
replaced the URL with `/account/workspace`. Email sign-in also replaced the original destination
with `/account`. Both paths could send the user to the existing tenant scorecard.

The web application now remembers only validated same-application audit-data paths through
sign-in and workspace selection, and clears the pending destination when the audit-data page
opens. Microsoft redirect sign-in uses the same validated destination. No API permissions,
collection activation settings, infrastructure or database schema changed in this fix.

Deployed the verified frontend using `scripts/Publish-NsoAuditWeb.ps1` with
`config/environments/dev.public.json` to `nso-audit-dev-web` in the Dev `NSO-Audit` resource group.
The deployment tool's `production` slot means the primary slot of this Dev resource; no Prod
environment was deployed. Deployment tokens were held only by the versioned deployment script.

Verification:

- Web TypeScript/production build and local browser checks passed.
- The live `/audit-data` URL returns HTTP 200 and its served JavaScript matches the local
  deployed bundle by SHA-256.
- `scripts/test-audit-data-ui.mjs` passed against the deployed frontend with all API requests
  intercepted using synthetic responses. This covers workspace selection, email sign-in,
  polling, license/user drill-down, search, missing access, route restoration, viewer controls
  and mobile layout. No real customer session or evidence was used.

To repeat the deployed-frontend browser check, set `AUDIT_UI_TEST_ORIGIN` to the Dev website
origin and `AUDIT_UI_TEST_API_ORIGIN` to the configured Dev API origin, then run
`node scripts/test-audit-data-ui.mjs`. These checks validate deployed navigation and rendering;
they do not establish live authentication, Microsoft collection or worker behavior.

Recovery: publish the prior reviewed frontend build with the same versioned script and target
configuration. Keep migration 017 and existing audit data intact. The new routing source and
test changes should be committed/pushed so future workflow deployments retain the fix.
