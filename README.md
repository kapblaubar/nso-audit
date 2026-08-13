# NSO Audit

Low-cost, multi-tenant Microsoft 365 and Azure security posture assessment.

## Repository layout

- `apps/web` — static React frontend
- `apps/api` — protected Azure Functions API and scan orchestration
- `packages/contracts` — shared API and finding types
- `infra` — subscription-scoped Bicep deployment for the `NSO-Audit` resource group
- `scripts` — sanitized Azure setup and, later, customer onboarding scripts
- `docs` — architecture and deployment notes

## Local setup

Requirements: Node.js 22 and npm 10 or later.

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run typecheck
npm run build
npm run dev:web
```

No Azure resources are created by the local build. See `docs/azure-bootstrap.md` before the
first deployment.

The Entra client ID in `apps/web/.env.example` is a public application identifier, not a
credential. Secrets, certificates, and private keys must never be placed in frontend
environment files.

Azure Cloud Shell setup scripts and their usage order are documented in `scripts/README.md`.
