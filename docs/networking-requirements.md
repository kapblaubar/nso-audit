# API and SQL network requirements

Approved direction: 2026-10-20. Existing NSO-Audit is Dev. This supersedes worker-IP allowlisting
for normal API-to-SQL access; it does not authorize a Prod deployment or deploy Front Door.

## Trust boundaries

Browser -> Static Web App / future Front Door -> authenticated Function API -> Azure SQL.
The website and Front Door do not receive SQL credentials or connect directly to the database.
The API uses its environment-specific managed identity and restricted SQL runtime role.
Network admission and SQL permissions are independent controls; neither replaces user authorization,
management-role checks, organization membership or row-level security.

## Required network behavior

- The active API must run on VNet-capable hosting. Use on-demand Flex Consumption with no
  always-ready instances for this Dev migration; instance memory and scale limits are parameters.
- Integrate a dedicated delegated subnet with Microsoft.Sql service endpoints. Azure SQL must
  admit that specific subnet through a virtual network rule, rather than mutable worker public IPs.
- Retain SQL Entra-only authentication, TLS verification and the existing restricted runtime role.
  No db_owner grant, SQL password, broad Azure-wide firewall bypass or browser SQL access.
- SQL publicNetworkAccess remains Enabled for service endpoints, but public IP firewall rules
  for Function workers must be retired after validation. This is subnet-restricted public-endpoint
  connectivity, not a SQL private endpoint. Operator migration access is temporary and exact-IP.
- Preserve existing Dev resource names and data. Introduce nso-audit-dev-api-flex and its plan/VNet
  as a planned side-by-side migration; retain nso-audit-dev-api for controlled rollback.
- Define network, API, public configuration and SQL subnet rules in Bicep with environment parameter
  files. Configuration that cannot be expressed in Bicep must have versioned scripts.
- Dev and Prod use separate subnets, identities, SQL servers/databases, storage, vaults and deployment
  targets. Do not reuse Dev identities, secrets, customer data or concrete resource IDs in Prod.
- A code deployment, cold start or scale event must not require SQL firewall edits. Validate actual
  API reads and writes through the subnet after removing legacy IP rules; compilation alone is not
  a successful migration. User-visible save failures must retain edits and distinguish service
  unavailability from an authorization denial.

## Front Door integration contract

Front Door is an inbound HTTP edge and does not fix or participate in API-to-SQL egress.
Future Front Door deployment must:

1. Route API requests to the active API origin without dropping /api, Authorization, request bodies,
   cookies when applicable, or OPTIONS. Use HTTPS to origins and disable caching of authenticated API
   responses. Probe /api/health with GET; failed database health must not be treated as healthy.
2. Restrict API origin traffic to AzureFrontDoor.Backend AND the exact Front Door profile's
   X-Azure-FDID, with deny-by-default once cutover is validated. The optional API Bicep parameters
   implement this gate. A header alone is not an origin security boundary. Keep deployment/control
   endpoints authenticated and available for the documented deployment path.
3. Establish supported Static Web App origin protection as part of the Front Door deployment,
   including any hosting-tier change; do not claim the public SWA origin is protected by API rules.
4. Configure exact external portal origins and Entra callback/logout redirects from environment
   configuration. Do not build redirects from untrusted forwarded host headers. Support a same-origin
   /api frontend base URL so adding the edge does not couple browser code to a Function hostname.
5. Resolve client IP for authentication throttling from trusted Front Door headers only when the
   origin restriction and expected FDID are active. Use X-Azure-SocketIP (actual TCP source),
   because X-Azure-ClientIP can reflect caller-supplied forwarding information. Never trust arbitrary forwarded headers from
   a public caller. Apply WAF/rate limits without replacing API authentication and authorization.
6. Keep per-environment edge IDs, hostnames, WAF settings, origin restrictions and deployment
   order in IaC/runbooks. Front Door SKU/cost, domains, certificates and WAF policy need an explicit
   deployment plan; no Front Door resource is created by this network repair.

## Deployment and recovery

Build and inspect what-if, provision a candidate alongside the old API, deploy code, validate SQL
connectivity and authorization, switch the website, then retire known legacy firewall rules.
Preserve the previous frontend/API configuration and public legacy IP-rule manifest for rollback.
Restore only explicitly recorded rules if returning traffic to the old non-VNet API; that rollback
restores the earlier unstable network behavior and is temporary. Never delete SQL or reverse schema
migrations to roll back hosting. Record real deployment evidence separately from rebuild claims.
A clean full Prod rebuild and restore rehearsal remain required before asserting reproducibility.

References: [Functions networking](https://learn.microsoft.com/azure/azure-functions/functions-networking-options),
[SQL VNet rules](https://learn.microsoft.com/azure/azure-sql/database/vnet-service-endpoint-rule-overview),
[Front Door origin security](https://learn.microsoft.com/azure/frontdoor/origin-security).

[Front Door request headers](https://learn.microsoft.com/azure/frontdoor/front-door-http-headers-protocol).

[Functions OIDC deployment](https://learn.microsoft.com/azure/azure-functions/functions-how-to-github-actions).
