# Audit pages, licenses and readable policy evidence

Deployed November 9, 2026 to the existing Dev `nso-audit-dev-web` resource in `NSO-Audit`
using the versioned web publishing script and Dev public configuration. Production web
build/typecheck and local browser checks passed. The same browser checks passed against
the deployed frontend with synthetic intercepted API responses; no real user session was
impersonated and no live audit was created by those checks. SQL evidence was unchanged.

The Dev frontend separates audit review from license inventory without changing audit
collection, SQL storage, permissions or existing saved evidence.

## Pages and navigation

- `/audit-data`: audit launcher and history.
- `/audit-data/{scanId}`: the selected audit's summary and configuration/security datasets.
- `/audit-data/{scanId}?dataset=namedLocations`: a bookmarkable dataset selection.
- `/audit-data/{scanId}/licenses`: license inventory from that same audit.
- License provider query: `provider=microsoft`, `provider=google` or `provider=aws`.
- Assignment drill-down: `view=assigned` and optional `skuId`, within the license page.

The workspace menu persists across audit and license views: Audits, Current audit, Licenses,
and Connection settings. The license page also includes Back to audit. Navigation retains
the selected ScanId; it does not silently replace the snapshot with the newest audit. From
the launcher, the menu uses the most recent typed audit when available. Legacy scorecards
remain accessible through their existing report/history links.

Provider links are presented as tabs. Microsoft 365 uses the saved SQL license and assignment
datasets. Google Workspace and AWS explicitly show collection unavailable; they never display
Microsoft inventory as provider data or call an unimplemented provider collector. Changing
providers does not start an audit or alter evidence.

License URLs and provider/assignment/filter queries survive sign-in and workspace selection.
Return destinations are restricted to same-origin, validated audit paths. Audit-specific
query parameters are retained; no arbitrary redirect target or authentication fragment is stored.
Returning to a license assignment URL or reloading retains its assignment view and SKU filter.
Clearing that filter removes it from the URL as well as the displayed query.

## Conditional Access and named locations

Conditional Access displays policy name/state, included/excluded users, groups, roles,
applications, locations and platforms, client types and risks, grant requirements, AND/OR
combination, session controls and additional captured targeting. Report-only and disabled
policies are identified without implying those controls are enforced. Unknown fields/IDs
are not invented or inferred as All. Missing values differ from explicit empty lists.

Location references resolve using named-location records from the same tenant and ScanId,
including all saved pages. No live Graph lookup or new permission is required. If names
cannot be retrieved, the saved IDs remain visible with a notice. User, group and application
references remain IDs when no captured friendly name is available.

Named locations show IP/country type, trust metadata, IPv4/IPv6 CIDR ranges, country/region
names with their original codes, unknown-country inclusion and collection time. Missing trust
metadata is shown as Not provided, rather than interpreted as Not trusted. Source JSON stays
available as optional detail for traceability; the default view is the readable evidence.

## Validation and deployment

The production web build/typecheck and `scripts/test-audit-data-ui.mjs` validate audit launch,
readable policy/location data, same-snapshot menu navigation, assignment drill-down, refresh,
browser Back, provider switching, saved deep links through workspace selection, missing-access
messages, viewer access and mobile/light-theme presentation. Tests use synthetic intercepted
API responses and do not create live audits or modify customer data.

Publish using `scripts/Publish-NsoAuditWeb.ps1` with the explicit existing Dev target and
`config/environments/dev.public.json`, then repeat the browser check against deployed assets.
No API deployment, database migration, infrastructure apply or source-permission change is
required. Recovery is a frontend-only deployment of the prior reviewed version; preserve SQL
audits and all collection settings.
