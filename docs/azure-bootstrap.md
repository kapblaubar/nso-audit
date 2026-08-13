# Azure bootstrap

The current workstation does not have Azure CLI installed or an authenticated Azure session.
These steps are intentionally not automated until the target subscription is confirmed.

## Planned low-cost resources

All resources deploy into the `NSO-Audit` resource group:

- Azure Static Web Apps Free
- Azure Functions Consumption (`Y1`)
- Standard LRS Storage account with private containers/tables
- Key Vault Standard with RBAC, soft delete, and purge protection
- User-assigned managed identity
- Log Analytics and Application Insights with 30-day retention and a 0.1 GB/day cap

Actual cost depends on traffic, scan volume, logs, and region. Review Azure's current pricing
and run a deployment what-if before creating resources.

## Before deploying

1. Install Azure CLI using Microsoft's supported installer for this workstation.
2. Authenticate with `az login`.
3. Confirm the exact subscription with `az account show` and select it explicitly if needed.
4. Replace `replace1` in `infra/dev.bicepparam` with a unique lowercase suffix.
5. Preview changes:

   ```bash
   az deployment sub what-if \
     --location westus2 \
     --template-file infra/main.bicep \
     --parameters infra/dev.bicepparam
   ```

6. Only after reviewing the preview, deploy:

   ```bash
   az deployment sub create \
     --name nso-audit-dev \
     --location westus2 \
     --template-file infra/main.bicep \
     --parameters infra/dev.bicepparam
   ```

The Entra multi-tenant App Registration is intentionally not created by this first Bicep
template. Its publisher identity, redirect URIs, verified domain, and exact Phase 1 Graph
permission manifest must be reviewed before creation.

