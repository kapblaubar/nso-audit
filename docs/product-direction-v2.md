# NSO Audit: expanded product requirements proposal

Status: discussion draft, 2026-10-19. This document records the requested direction and
proposed requirements. It does not represent implemented functionality or replace the existing
requirements until the open product decisions are resolved.

## 1. Requested direction

### Business purpose

NewSommer will offer a free security assessment to help US small and midsize companies
understand their IT security, prepare for cyber insurance questions, and identify gaps against
selected security framework outcomes. The assessment also introduces NewSommer's services and
creates opportunities for paid fractional IT/security leadership and advisory work.

The free assessment must deliver useful findings and a prioritized action plan independently
of whether the customer purchases services. Offer an optional NewSommer review and an explicit
request-help action on findings or the final report. Keep assessment results evidence-based;
commercial interest must not alter severity or suppress findings. Record service inquiries
separately from sensitive assessment evidence; any later CRM integration receives only the
minimum contact/request information authorized for that purpose.

Use clear positioning: "Free IT security and cyber insurance readiness assessment," with
framework alignment added where supported. Do not promise insurer approval, universal
insurance compliance, a formal independent audit, or NIST certification. Carrier-specific
requirements depend on the actual application/form and jurisdiction.

Proposed initial framework: NIST Cybersecurity Framework (CSF) 2.0, using its small-business
guidance. Treat this as a proposed scope choice, not a decision to implement every NIST
publication, NIST SP 800-53, SP 800-171 or CMMC. Version mappings from assessment controls
and questions to specific CSF outcomes, with source references, coverage and review status.
Show assessed gaps and unassessed areas; do not turn a limited questionnaire into a blanket
"NIST compliant" result. The free report should include an executive summary, evidence and
coverage summary, top risks, prioritized next steps, and optional contact with NewSommer.

Business measures: verified registrations, activated workspaces, completed assessments,
reports delivered and customer-requested consultations. Measure aggregate funnel activity
without exposing credentials or detailed security evidence to marketing analytics.

### Delivery starting point

There is sufficient direction to begin foundation work. The first implementation milestone is
registration and verification, a pending-setup experience, NewSommer workspace approval,
SQL-backed membership/isolation, and a short save/resume questionnaire. Include infrastructure
code, database migrations and meaningful authorization tests in this milestone. Keep the
existing scanner working until its data migration and integration are validated.

Authentication is split: NewSommer management uses Entra organizational sign-in; clients use
application-managed email/password accounts. Select a maintained authentication library and
document session/password handling before implementing local authentication. First
carrier-specific questionnaire mappings, connector vendors, and final framework breadth can
be resolved incrementally without blocking the foundation.

### Requested capabilities

- Expand assessment beyond Microsoft-hosted customer environments.
- Combine automated assessment with guided questions and supporting evidence, including
  preparation for cyber insurance applications and renewals.
- Implement customer/MSP multitenancy with explicit authorization and connector consent.
- Support customer-supplied integration credentials where required, held in Key Vault.
- Move structured application records from Azure Table Storage to a SQL database.
- NewSommer staff provision customer workspaces and approve their initial owners.
- Prioritize hybrid/on-premises environments and common MSP tools for expansion.
- Target US small and midsize businesses for the first insurance-readiness questionnaire.

The proposed product is an organization security assessment and evidence platform. Microsoft
365 and Azure remain its first automated connectors; an organization can participate without
either. Broader assessment coverage does not require moving the hosting platform out of Azure.

## 2. Audience and environment model

The initial audience is US small and midsize organizations and the MSPs managing them, with
hybrid/on-premises environments and common MSP tools prioritized alongside Microsoft.
Consultants preparing customer assessments are an adjacent audience. Broker/insurer collaboration is a
possible later workflow, subject to customer-controlled sharing.

Keep the control catalog independent of products. Start each assessment with a short profile:
industry, geography, employee/device counts, critical systems, data types, locations, IT service
providers, identity providers, email platforms, cloud platforms, and on-premises dependencies.
Distinguish customer-operated controls from provider-operated controls and shared responsibility.

Prioritize hybrid/on-premises evidence and selected MSP tools. Other candidate modules follow:

| Environment | Initial approach | Evidence to assess |
| --- | --- | --- |
| Microsoft 365 / Azure | Existing connectors, corrected and extended | Identity, endpoint configuration, cloud posture |
| Hybrid / on-premises | Questionnaire and reviewed export upload first | AD administration, remote access, patching, backup and restore |
| Google Workspace | Questionnaire initially; separately scoped connector later | Administrative access, MFA enforcement, email protection |
| AWS and other clouds | Questionnaire initially; provider-native read-only connectors later | Identity, exposed services, logging, protection and recovery |
| MSP/security products | Selected EDR, RMM, backup, firewall and awareness integrations | Coverage, exclusions, freshness, operational ownership |

No invasive scanning or on-premises agent is included by implication. Those require their own
scope, authorization, deployment, and support requirements. Non-Microsoft organizations use
portal-managed email/password accounts; organization memberships remain independent of
Microsoft connector consent or the customer's identity provider.

## 3. Guided assessment and insurance preparation

Offer a general security assessment and versioned insurance-readiness profiles. Each insurance
profile identifies its market, insurer/form where applicable, form edition, source, and review
date. Carrier-specific mappings require checking the actual applicable form. Public guidance
and questionnaires are research inputs, not a universal underwriting standard.

The questionnaire shall support conditional branching, save/resume, named owners, reviewer
comments, evidence requests, due dates, and answers of yes, no, partial, unknown, and not
applicable with justification. An answer can trigger follow-up questions, connector setup, or
an evidence-upload request. It must not silently grant access or enable collection.

Proposed question domains:

- MFA enforcement by service and population: email, administrators, remote access and critical
  applications; document exceptions and distinguish registration from enforcement.
- Endpoint protection: covered assets, supported operating systems, EDR operation and response
  ownership, including excluded and unmanaged devices.
- Recovery: backup scope, isolated or immutable copies, separate administration, last restore
  test, recovery objectives and evidence of the test outcome.
- Exposure and patching: externally accessible services, vulnerability review, patch targets,
  unsupported software and exception handling.
- Email and payment processes: phishing defenses, domain authentication, and independently
  verified changes to payment instructions.
- Governance: incident response, exercises, training, supplier responsibility and security
  ownership. Separate requested business/application details from scored security controls.

Example workflow: an organization selects Microsoft 365 plus on-premises servers. The system
suggests connecting Microsoft 365, asks which servers and remote-access systems exist, and
requests backup configuration plus the last restore-test record. If an answer claims universal
MFA but connected evidence shows a gap, create a discrepancy for review rather than overwriting
the answer or asserting an insurer response.

Every answer shall retain respondent, timestamp, question version, applicable scope, supporting
evidence, and reviewer decision. Automated suggestions require human confirmation. Reports
separate observed evidence, customer declarations, reviewer conclusions, missing evidence, and
contradictions. Unknown or unverified is never an automatic pass.

Output is an assessment report, action register, and exportable evidence/answer pack. It does
not guarantee insurance eligibility, coverage, pricing, or acceptance. Submission to a broker
or insurer is an explicit customer action. An approved report is an immutable version; changes
create a new review version. Do not reproduce entire proprietary carrier forms without checking
reuse rights.

## 4. Application tenancy and authorization

### 4.1 Portal registration and administrator setup

Initial Dev identities: `chris@newsommer.com` remains the NewSommer Entra management user.
`kapblaubar@gmail.com` is the nominated customer owner for the existing NewSommer assessment
workspace, including its historical reports. This is an ownership change within the existing
workspace, not a change to the audited Microsoft tenant or its application consent. Preserve
all organization, tenant and scan IDs. Do not merge the two identities or infer ownership from
matching email text. The customer nomination grants no access until the Gmail client account
is created and its email verified. Chris's management role is not revoked by a customer-role
handover. Client sign-in, verification and an authorized ownership-completion workflow are
required before declaring the handover complete.

Users register through the portal using an email address and an app-specific password.
Both work and personal addresses are supported, including `chris@newsommer.com` and
`kapblaubar@gmail.com`. These are examples of separate accounts; do not automatically link
them or assign them to an organization based on email domain. A stable internal user ID
identifies the account independently of changes to its verified email address.

Decision: clients use application-managed email/password authentication. The application
manages account verification, password resets, access and session lifecycle using a maintained
authentication library. Store only a salted adaptive password hash in the authentication data
store (SQL), never
plaintext or reversibly encrypted passwords. Portal passwords are not connector secrets and
do not belong in Key Vault. Administrators never see or choose another user's password.
Include rate limiting, secure reset tokens, session revocation and mandatory MFA for privileged
roles. Password reset is the recovery mechanism; password retrieval is not supported.

NewSommer staff and other platform management users must authenticate with Microsoft Entra
organizational sign-in. Validate tokens for the configured management application and approved
NewSommer Entra tenant; grant management access only through explicitly assigned roles.
An email ending in `newsommer.com` or a valid Microsoft sign-in alone is insufficient. Identify
management principals by issuer/tenant and subject/object ID, not email address alone.

Provide distinct client and management sign-in entry points and server-enforced authorization
policies. Client credentials and sessions can never authorize management endpoints, even when
the email matches a staff account. Management authentication does not automatically grant
unrestricted customer evidence access; retain explicit role and customer-scope checks.
There is no local-password fallback for platform management access. A customer workspace
administrator is a client role and uses client authentication; it is not a platform administrator.
Customer Microsoft connector consent remains separate from both login paths. Never automatically
merge a client account with an Entra management identity based on a matching email address.

Proposed initial flow:

1. User creates an account, verifies their email, and supplies a short registration profile.
2. The account enters pending workspace setup. It can view its own setup status but cannot
   browse customer workspaces or run scans.
3. An authorized NewSommer setup administrator reviews the request, confirms the organization/contact,
   creates the customer workspace, and explicitly assigns its initial owner.
4. The administrator selects the assessment purpose and initial modules, records missing
   information, and activates the workspace. Setup authority does not automatically grant
   unrestricted access to assessment evidence or connector credentials.
5. The assigned owner receives access and can complete the questionnaire, invite approved
   collaborators and configure connections according to their role. Connections require their
   own consent and access verification.

Initial profile fields: contact name and verified email; organization legal/display name;
website (optional); country/state; industry; approximate employee/device counts; whether IT
is internal or MSP-managed; environment types; assessment purpose (general review, insurance
application or renewal); and target date (optional). Allow unknown values and later correction.
Defer sensitive business details and integration credentials until the relevant assessment step.

Proposed setup states: email-unverified, pending-setup, needs-information, active, rejected and
suspended. Record setup approvals and membership changes in the audit trail. Only an explicit
invitation/approved membership grants access to an existing organization; email ownership alone
does not prove authority over a company. Workspace provisioning and initial-owner approval
belong to the NewSommer setup administrator role. Customer administrators manage only their
assigned workspace after activation. The first NewSommer administrator must be provisioned
through a controlled bootstrap; public registration cannot grant this role.

### 4.2 Organization boundaries

Use an internal customer organization ID, not an Entra tenant ID, as the data security boundary.
An organization may have multiple Entra tenants, subscriptions, vendors and sites. An MSP is an
organization with explicitly granted management relationships to customer organizations.

Proposed roles: customer owner, customer administrator, assessor, contributor and viewer;
MSP access is scoped to individual customer organizations. Optional reviewer access is explicit,
time-limited where appropriate, and audited. Connector administration can be separated from
assessment review. Platform operators do not receive routine customer-data access by default.

Each API call and background job resolves its customer organization against server-side
membership or delegation records. Sign-in proves identity; customer consent authorizes a
connector; neither alone authorizes an operator to view that customer's reports.

Microsoft connections continue to use the deployment's multitenant App Registration. Admin
consent grants the application permissions approved in the customer tenant. Azure RBAC and
other workloads' roles remain separate. Added permissions require actual grants and capability
verification; storing a credential in Key Vault does not grant permissions.

## 5. Connector credentials

Prefer provider-supported OAuth/consent and short-lived or federated access where available.
Customer-specific API keys or service-account credentials are allowed only for connectors that
need them, with documented read-only scope. Do not accept human administrator passwords.
The existing Microsoft consent flow does not require a new customer application secret.

A credential-entry workflow shall:

1. Authorize a connector administrator for the selected organization and connector instance.
2. Accept a secret over TLS in a dedicated form and send it to a protected backend endpoint.
   Disable analytics/session replay and request-body logging on this path; never persist values
   in browser storage, diagnostics, error messages, SQL or audit records.
3. Store the secret in Key Vault through a restricted managed identity. SQL stores an opaque
   credential reference and lifecycle metadata only. The backend derives the vault/secret
   destination; the browser cannot supply an arbitrary vault URI.
4. Return status and safe metadata only; never offer secret readback. Support testing,
   replacement, revocation and expiry warnings without exposing the value.
5. Restrict retrieval to the authorized connector worker. Keep onboarding writes distinct from
   runtime reads; validate connector endpoints to prevent sending secrets to arbitrary hosts.

Design preference: separate customer connector vaults from deployment-owned credentials, with
per-customer vaults and scoped worker identities where a strong boundary is required. A shared
vault is a cost/operations alternative needing an explicit isolation decision. Tenant-prefixed
names alone do not enforce isolation, and separate vaults do not isolate customers if one
identity can read all vaults. Certificates use a dedicated import workflow, not ordinary text
fields. Disconnect disables future use; deletion and recovery handling must account for vault
soft-delete/retention behavior.

## 6. SQL and evidence storage

Decision: replace Azure Table Storage with SQL as the system of record for structured application
data. Azure SQL Database is the proposed Azure-hosted implementation, accessed by the backend
using managed identity. Confirm service tier against expected workload and cost before
deployment. This decision supports relationships, transactions, controlled schema migrations
and reporting across organizations, users, assessments and evidence; increased data volume
alone is not the reason to choose SQL. Keep Blob Storage for attachments, large evidence and
raw artifacts, and retain queues and runtime storage required by Azure Functions.

Candidate entities:

- Organizations, identity principals, memberships and MSP/customer relationships.
- Environments, connector instances, granted scopes and credential references.
- Versioned controls, questionnaire templates, questions and insurer mappings.
- Assessments, collection runs, answers, findings and control evaluations.
- Evidence metadata, answer/evidence links, discrepancies and review decisions.
- Action items, report versions and audit events.

Every customer-owned row has an organization ID. Tenant-scoped foreign keys prevent linking
records to another organization. Use API authorization plus SQL row-level security with read
filters and write blocking. Tenant context must be initialized and cleared correctly for pooled
connections and jobs; missing context fails closed. Customer application identities cannot
disable the policies. Cross-customer MSP summaries use an explicit authorized reporting path.

Evidence metadata includes source, collection time, scope, checksum, schema/version, expiry or
review date, classification, and an organization-owned Blob reference. The backend authorizes
downloads. Uploads have size/type limits, quarantine and malware handling. Assessments retain
the control/questionnaire versions used so later edits do not rewrite historical conclusions.

SQL migration shall preserve existing tenant/scan IDs, timestamps, findings, scores and baseline
versions. Map each legacy tenant to an explicitly verified organization. Provide idempotent
backfill, reconciliation of record counts and evidence, a controlled cutover, rollback, and a
retention/decommission decision for old Tables. No live migration is authorized by this draft.

## 7. Assessment execution and reporting

- Questionnaire-only assessments work without cloud credentials or an Azure subscription.
- Selected automated modules run asynchronously, with durable status, cancellation semantics,
  deduplication, pagination, retry/backoff and independent failure handling.
- Unsupported, not applicable, not connected, incomplete and failed collection are distinct.
- Report technical posture, evidence coverage and questionnaire/review completion separately.
  Preserve Microsoft's vendor scores as independent measurements. Do not invent an insurance
  readiness percentage or treat unverified declarations as equivalent to automated evidence.
- Add retention policies, customer deletion/export, access auditing, recovery procedures and
  cross-organization isolation tests before general availability.

## 8. Proposed delivery sequence

### Environment and infrastructure requirements

The existing `NSO-Audit` Azure resource group is designated **Dev**. A future **Prod** environment
must be reproducible from the same versioned infrastructure modules, using separate parameters
and deployment targets. Infrastructure as code is part of each feature's completion criteria.

- Maintain Bicep for resources, identities, role assignments, networking, configuration,
  diagnostics, SQL and storage. Use versioned automation for Entra/customer identity setup
  and database-level configuration not managed directly through Bicep.
- Keep Dev and Prod databases, storage, vaults, application identities, consent callbacks,
  credentials and deployment permissions separate. Do not promote customer data or secrets
  with application releases.
- Version schema migrations alongside the code; document infrastructure deployment, identity
  bootstrap, database migration and application release order, including recovery steps.
- Separate environment configuration from shared templates; support environment-specific
  capacity, retention, backup and monitoring policies without copying entire templates.
- Validate templates and migrations in CI, review what-if before deployment, and use explicit
  environment targets. Prod releases require a deliberate promotion and approval gate.
- Reconcile the current Bicep with live Dev before applying changes: its generated names differ
  from current resources. Preserve existing Dev names until an intentional migration is planned.
- Prove a clean deployment and subsequent repeat deployment in a disposable environment;
  validate authentication, authorization, migration and recovery before provisioning Prod.
- Maintain the rebuild runbook with every change. Record any unavoidable manual dependency,
  its owner and verification, rather than leaving it in shell history or portal state.

### Application milestones

1. Resolve organization model, initial market, initial non-Microsoft scope and questionnaire
   workflow; produce UI flows and example completed assessments.
2. Implement SQL-backed organizations, membership/delegation and storage abstraction; validate
   isolation and migrate existing records with a tested rollback.
3. Ship guided questionnaire, evidence upload and review/action workflows; make Microsoft
   scanning optional and correct the existing collector completeness/status behavior.
4. Add a versioned insurance-readiness profile and reviewed evidence/answer export.
5. Add the first selected non-Microsoft connector and credential onboarding; expand only after
   validating the complete customer workflow.

## 9. Decisions still open

- Which MSP tools to integrate first within the selected hybrid/on-premises and US SMB scope.
- Whether Q/A "loads things" means only follow-up content/evidence requests or also importing
  an insurer questionnaire. This draft assumes the former; carrier-form import is separate.
- Maintained local authentication library, session design and reset/verification delivery for
  client accounts; Entra management application configuration and initial staff-role assignment.
- Who may invite an MSP and approve its customer access; how customer ownership is verified.
- Shared SQL database versus dedicated databases for higher-isolation customers.
- Credential/vault isolation, acceptable connector credential types and certificate handling.
- Data residency, retention, attachment limits, reviewer authority and initial export formats.
- Which carrier forms to map first and whether broker/insurer collaboration is in scope.

## Dev customer administration implemented

The `/clientmanagement` page uses staff Entra authentication plus an explicit management role.
Admins can create and edit customers and their pending user roster. Company name, primary
contact name and email are required; general business details, Microsoft account, Entra tenant
ID and Azure subscription IDs are optional. Non-Microsoft customers are supported. User roles
are intended roles only until verified client-account activation is implemented. Profile data
is stored in SQL with organization isolation, audit events and concurrent-edit protection.
See `database/customer-management.md` for deployment and recovery details.

## 10. Research sources

Reviewed 2026-10-19. Validate exact carrier, jurisdiction, edition and connector requirements
when implementing; these sources support the direction rather than an exhaustive specification.

- Coalition application overview (application/business information and MFA questions):
  https://help.coalitioninc.com/hc/en-us/articles/7665931229851-Our-Application-What-information-do-I-need-to-quote-a-policy-with-Coalition
- Travelers cyber risk guidance (MFA, endpoint detection/response and backup practices):
  https://www.travelers.com/resources/business-topics/cyber-security/cyber-security-best-practices
- Microsoft application/service principal model:
  https://learn.microsoft.com/en-us/entra/identity-platform/app-objects-and-service-principals
- Microsoft multitenant Key Vault design and isolation tradeoffs:
  https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/key-vault
- Azure SQL multitenant design patterns:
  https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns?view=azuresql
- NIST CSF 2.0 Small Business Quick-Start Guide (proposed framework starting point):
  https://www.nist.gov/publications/nist-cybersecurity-framework-20-small-business-quick-start-guide

## Customer entry points, 2026-10-20

Public navigation exposes one Sign in button leading to `/signin`. Customers choose Microsoft
work sign-in or an email/password account, with email verification and password recovery through
Azure Communication Services Email. The unlisted `/clientmanagement` entry requires Chris's exact
configured Dev Entra identity plus an active SQL staff role. Staff explicitly activate verified
contacts; registration does not grant workspace access. Email members can open audits for existing
approved Microsoft connections, with viewer write restrictions. Microsoft connection consent is
separate from portal sign-in. See `database/customer-accounts.md` for implementation limits.
