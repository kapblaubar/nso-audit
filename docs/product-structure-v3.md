# NSO Audit product structure

Discussion structure, 2026-10-20. The four business directions below reflect Chris's latest
request; the detailed workflow, modules and sequencing are proposals for review. This document
organizes the next requirements discussion. It does not claim that the proposed features exist
or authorize deploying them. The existing Microsoft baseline remains the implemented baseline.

## 1. Product purpose

Offer a useful free IT posture and insurance-readiness assessment that introduces companies to
NewSommer's fractional CTO, technology leadership and product management services.

The assessment should answer:

1. What technology and security protections does this company have?
2. What supports those conclusions, and what remains unknown?
3. What could interrupt the business or expose sensitive information?
4. What should the company do first, who should own it, and where would leadership help?

Deliver the free findings and practical next steps whether or not a company buys services.
A follow-up conversation is optional. Never inflate risk or change scoring to generate work.
Product/technology opportunities belong in a separate advisory view; they do not become
security failures or answers to insurance questions.

## 2. One assessment, multiple purposes

Use one versioned control catalog and evidence record, with different report profiles:

| View | Audience | Main content |
| --- | --- | --- |
| Business overview | Owner, CEO, finance or operations lead | Business exposure, important gaps, strengths and decisions |
| Insurance-readiness pack | Customer and a customer-authorized broker/insurer | Reviewed answers, supporting evidence, scope, dates, exceptions and unresolved items |
| Technical findings | IT staff, MSP and NewSommer reviewer | Observed configurations, asset/scope coverage, technical evidence and remediation steps |
| Technology leadership roadmap | Owner and fractional CTO/product leadership | Priorities, ownership, dependencies, business impact and optional advisory opportunities |

An insurer-specific form is a versioned mapping onto these controls, not a new assessment engine.
Identify the actual carrier/form edition before claiming coverage of its questions. The customer
reviews and authorizes sharing; no automatic submission or promise of insurance acceptance.
Keep the product name NSO Audit if desired, while describing outputs as an assessment and
readiness report rather than implying an independent certification.

### Required assessment views (2026-10-21)

The product must present shared security and configuration data through selectable views for
different purposes. These four view families are requested product requirements; their detailed
criteria, mappings and delivery sequence still require definition. They are not implemented features.

| View family | Purpose and required presentation |
| --- | --- |
| AI agent readiness / Copilot readiness | Present readiness to adopt and operate AI agents and Copilot, including identity and access, data exposure and sharing, information governance, agent permissions, oversight and relevant configuration. Distinguish general AI agent readiness from a selected Copilot product/use case; show prerequisites, observed settings, evidence gaps and recommended preparation. |
| Insurance company views | Present answers, evidence, exceptions and unresolved items in the structure needed by a selected insurance provider and questionnaire/form edition. Support multiple provider profiles using the same underlying assessment. |
| General security and configuration | Present platform/domain posture, configuration findings, coverage, strengths, gaps and prioritized remediation for business and technical audiences. |
| CMMC and NIST views | Present evidence and gaps against explicitly selected CMMC or NIST profiles. Identify the framework/publication, version, applicable scope and, where relevant, level. Treat CMMC and individual NIST frameworks/publications as distinct profiles with reviewed mappings. |

These purpose-based views complement the audience/report views above. A user must be able to
switch between applicable views for the same assessment without re-entering shared answers or
recollecting valid evidence. View availability must state whether its criteria and mappings are
supported; a proposed profile must not appear as a completed assessment.

Each profile must have a stable identifier and version, applicability rules, criteria and reviewed
mappings to shared controls/evidence. A view may require additional questions or evidence.
Reusing evidence must preserve its scope, freshness, provenance and review status; a mapping
alone does not establish that a requirement is satisfied. Profile-specific conclusions and gaps
must remain distinguishable from shared observations and other profiles' conclusions.

Each view and export must identify the selected profile/version, assessment scope, evidence
coverage, unknowns, exceptions and prioritized actions. Switching views must preserve customer
authorization and evidence-sharing restrictions; an insurance-provider view does not grant an
insurer access. Record the profile/mapping versions in approved report snapshots.

Readiness and gap reports must not claim formal CMMC certification, NIST approval, insurance
acceptance or guaranteed safe AI deployment. Exact framework editions, CMMC scope/levels,
insurer forms and Copilot products/use cases must be selected and validated before their detailed
assessment criteria are published.

Acceptance: use one sample assessment to demonstrate switching among all four supported view
families, trace a reused evidence item to each relevant criterion, show additional evidence needs
and differing conclusions, and export reports with the correct profile/version and access scope.

## 3. Assessment modules

| Module | What it establishes | Typical evidence |
| --- | --- | --- |
| Business and technology profile | Company scope, critical services, platforms, locations, data and providers | Short intake, system list, interviews |
| Assets and configuration | What exists, who manages it, lifecycle/support and configuration ownership | Asset lists, device inventories, cloud settings |
| Identity and access | Administrative access, MFA enforcement, onboarding/offboarding and exceptions | Questionnaire, identity settings, access review records |
| Endpoints and patching | Protection coverage, supported systems, patch process and unmanaged assets | EDR/MDM exports, patch records, platform observations |
| Network and remote access | External exposure, remote access controls and ownership | Firewall/VPN summaries, diagrams, reviewed configuration exports |
| Cloud, email and collaboration | Tenant configuration, email protection, sharing and cloud administration | Existing Microsoft collection plus manual evidence for other systems |
| Backup and business continuity | Protected systems, isolation, restore capability and recovery objectives | Backup reports, restore-test results, recovery procedures |
| Data protection and AI use | Sensitive data, retention, sharing, DLP and relevant AI-use controls | Policies, classification/retention configuration, future validated Purview observations |
| Detection and incident response | Monitoring, escalation, response roles, incident plan and exercises | Alert ownership, response plan, exercise records |
| Governance and suppliers | Accountable owners, staff practices, MSP responsibilities and supplier dependencies | Policies, training records, contracts and responsibility assignments |

Modules are platform independent. Microsoft is the first automation source, not a prerequisite
for a company assessment. A company without Microsoft must be able to complete the manual path.
An assessment may include several environments; its scope must identify which ones were assessed.

## 4. Three evidence paths

### Guided questions

Chris, an authorized customer or an explicitly delegated provider can fill in answers. Support
save/resume, conditional follow-ups, an assigned owner, reviewer comments and evidence requests.
Record who answered, when, which scope they meant and the question/template version.

Use understandable answers: Yes, Partly, No, Unknown, and Not applicable with justification.
A submitted answer is a declaration until the review/evidence requirements for that control
are met. A reviewer records a conclusion rather than silently rewriting the original answer.

### Documents and scanned evidence

Allow relevant PDFs, scans/images, configuration exports and supporting records. Keep the
original, uploader, date, document scope and links to questions/controls. Apply private storage,
organization authorization, file type/size limits, quarantine and malware handling before access.
Set retention/deletion and permitted sharing requirements before enabling public uploads.

First release: upload and manual review. Later: OCR and optional extraction to suggest fields,
with page references and human confirmation. A scanned document is not automatically reliable,
and extracting a date or claim is not verification that a protection works. Do not use customer
documents for model training or external processing by default; scope any such service explicitly.

### Automated observations

Read-only connectors collect configuration and coverage for approved systems. Each observation
identifies customer/environment, source, permissions, collection time, control/rule version and
collection completeness. Missing permissions, unsupported capabilities, failures and stale data
are visible; none is a pass. Do not infer full protection from the mere existence of a policy.

Inventory and validate the existing Microsoft collectors before promising additional coverage.
Purview, backup products and other connectors need their own later capability/permission scope.
Automation can suggest an answer or identify disagreement; it cannot silently overwrite a
customer declaration or approve an insurance response.

## 5. Shared control record

Each control has a stable ID and version, business question, technical criteria, applicability,
expected evidence, assessment rule, and mappings to report/form profiles. Keep three separate axes:

| Axis | Example values | Purpose |
| --- | --- | --- |
| Conclusion | In place, Partly in place, Gap, Unknown, Not applicable | What the assessment concludes |
| Evidence/review | Declared, Observed, Reviewer checked, Missing, Conflicting | Why the reader should trust it |
| Collection | Complete, Partial, Failed, Not connected, Unsupported | Whether the requested data was obtained |

Evidence is scoped and dated. A control can cite several evidence items; an item can support
several controls. Keep conflicting statements for review rather than choosing whichever is
most favorable. Support accepted exceptions, accountable owners and review/expiry dates.

Example: "Can the business restore its critical systems?"

- The form records critical systems, recovery objectives and who owns restoration.
- A connector may show scheduled jobs and recent successful backup runs.
- A restore-test record supplies the test date, systems covered, outcome and reviewer.
- A healthy backup job alone does not establish successful restoration. Without restore evidence,
  that part remains unverified/unknown and appears as an action.

Avoid a single headline percentage initially. Show domain conclusions, important risks and
assessment coverage. Any later score requires a reviewed method with versioned rules and
visible unknowns; existing Microsoft/vendor scores remain separate measurements.

## 6. Proposed customer journey and navigation

Invitation -> company profile -> choose assessment scope -> answer questions / provide evidence
and optionally connect systems -> review missing/conflicting items -> approve report -> action plan.
Collection and questionnaire work can happen in parallel. A connector failure must not discard
answers or block completion of the manual portion. Reports disclose incomplete coverage.

Customer workspace navigation:

1. Overview: scope, progress, important gaps and next steps.
2. Assessments: drafts, reviewed versions, reporting periods and scope.
3. Questions: assigned work, saved answers and follow-ups.
4. Evidence: documents, observations, requests and review status.
5. Connections: approved systems, consent and collection health.
6. Action plan: priorities, owners, status and supporting findings.
7. Reports: executive, insurance and technical views with approved exports.

Staff keep `/clientmanagement` for customer provisioning/invitations. Assessment review and
advisory work need an explicitly authorized staff/customer context; the management login must
not imply unlimited document access. Customer admins control membership and external sharing.
Add broker/insurer read-only sharing later as a separately authorized, expiring scope.

## 7. Reports and service opportunities

Each report identifies customer, assessment scope, assessment date, source freshness, reviewers,
versions, exclusions and evidence coverage. Approved reports are snapshots; later changes create
a new version. Provide:

- Executive overview with business impact and the most important decisions.
- Domain findings with source/review status, strengths, gaps and exceptions.
- Insurance-readiness answers and an evidence index, clearly showing unanswered/unverified items.
- Prioritized actions grouped into immediate, near-term and planned work, with owners and dependencies.
- Optional leadership conversation: operating ownership, provider coordination, technology roadmap,
  product delivery or other opportunities identified during the engagement.

Do not include all raw evidence in every export. Let the customer choose permitted documents
and recipients. Sensitive technical details need a separately controlled appendix. Do not send
assessment evidence into marketing/CRM systems; an authorized service inquiry needs only the
contact details and request. Useful free outputs must not be held behind booking a sales call.

## 8. Logical model and reuse

Organization -> Assessments -> Control evaluations -> Answers / Evidence / Observations
                                         -> Findings -> Actions -> Report versions

Cross-cutting records: users/memberships, environment scopes, control/questionnaire versions,
connector instances/collection runs, document review and sharing permissions, and audit events.
An organization is the customer boundary; Microsoft tenant IDs are connector identifiers within
that boundary. Preserve existing organization, tenant and scan IDs and history.

Reuse current invitations, SQL organization isolation and existing scan storage. Existing tables
for assessments/answers are a starting point, not a claim that the questionnaire workflow exists.
Keep structured records in SQL and private document binaries in Blob Storage, linked by
organization-scoped evidence metadata. Version schema migrations and keep infrastructure changes
in shared Bicep/environment parameters. Do not deploy new storage, OCR or AI services from this
structure discussion; they need detailed scope, permissions, cost and recovery requirements.

## 9. Delivery slices

| Slice | Deliverable | Completion evidence |
| --- | --- | --- |
| 1. Assessment skeleton | Company intake, scoped assessment, first question set, save/resume, manual reviewer conclusions and a useful report/action list | Complete a sample non-Microsoft company assessment end to end |
| 2. Document evidence | Private upload, review, question/control links and evidence index | Isolation, file handling, authorized download and deletion checks |
| 3. Existing automation integration | Attach existing Microsoft scan observations to the same assessment and show collection health/conflicts | Preserve existing scans and demonstrate truthful partial/failed collection |
| 4. Insurance profile | One general readiness view, then a selected real form and reviewed mappings | Trace each answer to scope, evidence and human approval |
| 5. Expand automation | Detailed Purview/other connector backlog; selected OCR assistance | Validate each capability, permission, evidence meaning and failure mode |

Slice 1 should be a usable free assessment even if a customer has no connector or documents.
Add document collection to the free service only when its privacy/security controls are ready.
Use manual document review to learn what needs extracting before investing in OCR automation.

## 10. Decisions for the next requirements session

Define the initial question/control list and report example first. Then settle:

- Initial free-service scope, expected customer effort and NewSommer review effort.
- Which critical system types and company profiles to support first.
- Who reviews and approves the report and who owns unresolved answers/actions.
- Evidence retention, file limits, sharing/export rules and operating cost boundaries.
- First broker/insurer form, if any, after the general assessment works.
- The exact automated data already available versus proposed Purview/other collection.

Success measures: companies completing an assessment, useful reports delivered, agreed actions
and optional customer-requested advisory conversations. Do not optimize for collecting more
sensitive data or generating more alarming scores.

Related: [earlier expansion proposal](product-direction-v2.md),
[current foundation baseline](baseline-v1.md), [invitation flow](customer-invitations.md).
