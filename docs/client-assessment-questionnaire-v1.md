# Client security and technology questionnaire v1

Draft for review, 2026-10-21. This is the initial question catalog for the expanded assessment;
it does not establish a validated scoring method or a complete framework checklist.

Implementation note: the first backup form and migration 013 are described in
[questionnaire storage](../database/questionnaires.md). Other sections below remain proposed
questions. Implementation in source does not mean the schema or feature has been deployed.

## How an assessment works

IDs such as BKP, IAM and NET are internal catalog conventions, not official NIST or CMMC
identifiers. Framework requirements will have separate, reviewed and versioned mappings.

Create an assessment for each client organization, then identify the tenants, locations and
systems in scope. Repeat relevant question groups for each environment where answers differ.
A client can have several tenants and non-cloud systems; do not assume one tenant represents
the whole company. Assign an answer owner and reviewer and support save/resume.

Every answer stores question ID/version, organization, assessment, environment/system scope,
respondent, response date, answer, comments and linked evidence. Preserve original declarations
separately from automated observations and reviewer conclusions. Never request passwords,
recovery codes, private keys or credential values in answers or evidence.

Answer types:

- **YN:** Yes / No / Unknown / Not applicable (with justification).
- **Status:** In place / Partly in place / Not in place / Unknown / Not applicable (with justification).
- **Coverage:** total in scope, total covered, calculated percentage, measurement date and source.
  If counts are unavailable, accept an explicitly estimated percentage or Unknown. Zero in scope
  means applicability review, not 100% coverage. Covered cannot exceed total.
- **Select:** choose one named option; include Unknown and justified Not applicable.
- **Multi:** select all that apply; None and Unknown are exclusive of substantive choices.
- **Date:** date / Never / Unknown / Not applicable with justification.
- **Text / Number:** descriptive answer or value with unit; allow Unknown and justified Not applicable.

Ask for evidence references and explanations of exceptions alongside each group. Evidence may
be described or linked initially; private file uploads depend on the document-evidence release.
For a No answer, retain follow-ups that establish coverage, impact and planned action; hide only
details that cannot apply. Never automatically turn hidden answers into a pass. Reconfirm older
answers when scope changes, and preserve submitted assessment versions.

## 1. Company and assessment scope

| ID | Question | Answer |
| --- | --- | --- |
| SCP-01 | What company, business units and locations does this assessment cover? | Text |
| SCP-02 | Who owns this assessment, IT operations and security decisions? | Text: roles and contacts |
| SCP-03 | How many employees, contractors and IT administrators are in scope? | Number for each |
| SCP-04 | Which environments are included? | Multi: Microsoft 365, Azure, AWS, Google Workspace, Google Cloud, on-premises, other |
| SCP-05 | What tenants/accounts, domains and locations belong to each environment? | Repeating scope list |
| SCP-06 | Which business services are critical, and which systems support them? | Repeating service/system list with owner and criticality |
| SCP-07 | What sensitive data do you handle, and where is it stored? | Multi: personal, health, payment, financial, intellectual property, contract-designated sensitive data, other; locations |
| SCP-08 | Which MSPs or suppliers operate systems, and what responsibilities do they hold? | Repeating provider/responsibility list |
| SCP-09 | What is excluded, why, and who approved the exclusion? | Text |
| SCP-10 | Which report views are requested? | Multi: general security/configuration, insurance, AI agent/Copilot readiness, CMMC, NIST; selected profile/version or To be selected |

## 2. Asset inventory and ownership

Repeat AST-01 through AST-06 for endpoints, physical/virtual servers, databases, network devices,
cloud workloads, business applications and SaaS services. Separate managed and unmanaged assets.

| ID | Question | Answer |
| --- | --- | --- |
| AST-01 | Do you maintain an inventory for this asset class? | Status |
| AST-02 | What proportion is included in the inventory? | Coverage |
| AST-03 | What proportion has an assigned business and technical owner? | Coverage |
| AST-04 | What proportion uses supported software/firmware or a supported service? | Coverage; unsupported exceptions |
| AST-05 | How often is the inventory reconciled with actual systems? | Select: continuously, daily, weekly, monthly, quarterly, annually, never, other |
| AST-06 | When was the inventory last reviewed? | Date |

Suggested evidence: inventory export, discovery summary, ownership and lifecycle records.

## 3. Backups and recovery

Create a separate backup group for each of these classes:

| Class code | Asset class | Scope considerations |
| --- | --- | --- |
| END | Endpoints | Workstations/laptops; distinguish local data from data protected elsewhere |
| SRV | Servers | Physical and virtual servers; distinguish system and application recovery |
| DB | Databases | Managed and self-hosted databases; identify relevant instances/data stores |
| SaaS | Email and collaboration/SaaS | Mailboxes, shared files, sites and other required application data |
| CLD | Cloud workloads and storage | Workloads, objects/files and deployment/configuration dependencies |
| NET | Network and security configuration | Firewall, switch, VPN and other required device configurations |

Repeat by product, environment or criticality where strategies differ. Question IDs combine the
base ID and class, for example `BKP-01.END` and `BKP-01.DB`; each repeated group also has a stable
scope ID. Avoid double-counting assets across groups in later reporting.

| ID | Question, asked for each asset class | Answer |
| --- | --- | --- |
| BKP-01 | Do you have a defined backup strategy for these systems/data? | YN |
| BKP-02 | What percentage is covered by that strategy? | Coverage |
| BKP-03 | What percentage currently has successful backups within its required schedule? | Coverage; last measurement date |
| BKP-04 | How frequently are backups taken? | Select: continuous, hourly, daily, weekly, monthly, other; actual interval if other |
| BKP-05 | What backup product/service and method are used? | Text; distinguish backup, replication, synchronization and retention features |
| BKP-06 | What data/system components are included or excluded? | Text; exclusions and reason |
| BKP-07 | How long are backups retained? | Number with days/months/years; repeat for each retention tier |
| BKP-08 | What maximum data loss is acceptable to the business (recovery point objective)? | Number with minutes/hours/days; approved owner |
| BKP-09 | What maximum recovery time is acceptable (recovery time objective)? | Number with minutes/hours/days; approved owner |
| BKP-10 | Are backup copies separated from production failure risks? | Status; storage/service/location and shared dependencies |
| BKP-11 | Are copies protected from alteration or deletion by compromised production administrators? | Status; mechanism, protection duration and exceptions |
| BKP-12 | Are backup administration privileges restricted and protected with MFA where supported? | Status; privileged identities and exceptions |
| BKP-13 | Are backups encrypted in transit and at rest, and is key recovery documented? | Status for each; explanation without key values |
| BKP-14 | Are failures monitored, assigned and followed through to resolution? | Status; owner and alert/review frequency |
| BKP-15 | When did you last successfully restore from backup? | Date; systems/data restored and outcome |
| BKP-16 | What proportion has a successful restore test within your required testing interval? | Coverage; interval and test scope |
| BKP-17 | Did tested restoration meet the approved recovery point and recovery time objectives? | Status for each; measured results |
| BKP-18 | How often do you perform restore tests? | Select: monthly, quarterly, twice yearly, annually, after major changes, never, other |
| BKP-19 | Is a recovery procedure documented and accessible during an outage? | Status; owner and last review date |
| BKP-20 | What gaps, exceptions or planned improvements remain, and who owns them? | Text; owner and target date per action |

If BKP-01 is No, still establish actual protection and coverage: ad hoc backups may exist.
If coverage is zero, capture business impact and recovery alternatives. For databases, add:

| ID | Database-specific question | Answer |
| --- | --- | --- |
| BKP-DB-01 | Can required databases be restored to a selected point in time? | Coverage; recovery window and limitations |
| BKP-DB-02 | Are backups application-consistent and validated using a database recovery test? | Status; last test and outcome |

Suggested evidence: strategy, coverage/job summaries, retention settings, deletion protections,
restore-test results and recovery runbooks. A successful backup job does not prove restoration;
synchronization or replication alone must not be automatically accepted as recoverable backup.

## 4. Identity and access

Repeat coverage questions for each identity environment and separately for administrators and
ordinary users. Distinguish policy configuration from actual enforcement and exceptions.

| ID | Question | Answer |
| --- | --- | --- |
| IAM-01 | Are individual accounts used instead of shared accounts? | Coverage; shared-account purpose and owner |
| IAM-02 | Is MFA enforced for interactive access? | Coverage for administrators and ordinary users; methods and exceptions |
| IAM-03 | Is phishing-resistant MFA enforced where required by your policy? | Coverage; policy scope and methods |
| IAM-04 | Do administrators use separate privileged accounts with limited permissions? | Coverage |
| IAM-05 | Are legacy authentication methods disabled where applicable? | Status; remaining methods and exceptions |
| IAM-06 | Is access approved when people join or change roles? | Status; approver and process |
| IAM-07 | How quickly is access revoked after departure or termination? | Number with hours; process and exceptions |
| IAM-08 | How often are user and privileged permissions reviewed? | Select: monthly, quarterly, twice yearly, annually, never, other; last review date |
| IAM-09 | Are emergency access accounts controlled, monitored and tested? | Status; last test date |
| IAM-10 | Are service accounts, application identities and credentials inventoried and reviewed? | Status; owner, review frequency and credential lifecycle process |
| IAM-11 | Is external/guest access approved, time-limited where appropriate and reviewed? | Status; review date and exceptions |

Suggested evidence: scoped identity/policy summaries, access reviews and onboarding/offboarding records.

## 5. Endpoints, servers and vulnerability management

Repeat relevant coverage questions separately for endpoints and servers, including remote devices.

| ID | Question | Answer |
| --- | --- | --- |
| DEV-01 | What proportion is enrolled in central management? | Coverage; product |
| DEV-02 | What proportion has active endpoint protection/EDR reporting healthy? | Coverage; product and observation date |
| DEV-03 | What proportion has storage encryption enabled? | Coverage; recovery-key custody process |
| DEV-04 | What proportion follows a reviewed secure configuration baseline? | Coverage; baseline/version and deviations |
| DEV-05 | Are local administrator privileges restricted and reviewed? | Status; exceptions |
| DEV-06 | What are the required remediation deadlines for critical and high-risk vulnerabilities? | Number with days for each; policy and exception process |
| DEV-07 | What proportion meets the applicable patch/remediation deadline? | Coverage by severity; reporting period |
| DEV-08 | How often are vulnerabilities assessed? | Select: continuously, daily, weekly, monthly, quarterly, never, other; last assessment date |
| DEV-09 | Are personal/unmanaged devices restricted from sensitive resources? | Status; allowed access and protections |
| DEV-10 | Are software installation and application execution controlled? | Status; method and exceptions |

Suggested evidence: management/EDR health, encryption and patch summaries, vulnerability report and baseline.

## 6. Network, remote access and configuration

| ID | Question | Answer |
| --- | --- | --- |
| NET-01 | Are network boundaries, critical systems and external connections documented? | Status; last review date |
| NET-02 | Is internet-facing exposure inventoried and reviewed? | Status; last review and owner |
| NET-03 | Is remote access restricted, approved and protected with MFA? | Status; services, coverage and exceptions |
| NET-04 | Are administrative interfaces restricted to approved access paths? | Status; exceptions |
| NET-05 | Are critical, guest and other relevant networks separated with controlled traffic? | Status; scope and validation |
| NET-06 | Are firewall/security rules reviewed and unnecessary access removed? | Status; frequency and last review |
| NET-07 | Are configuration changes approved, recorded and recoverable? | Status; change and rollback process |
| NET-08 | Are network/security devices supported and updated? | Coverage; unsupported exceptions |

Suggested evidence: redacted diagrams, exposure inventory, remote-access policy and rule/change reviews.

## 7. Cloud, email and collaboration

Repeat by tenant/platform. Automated observations can supplement answers where supported.

| ID | Question | Answer |
| --- | --- | --- |
| CLD-01 | Are cloud resources covered by ownership, configuration and access policies? | Coverage; policy/baseline |
| CLD-02 | Are public resources and external sharing reviewed and restricted appropriately? | Status; exceptions and review date |
| CLD-03 | Are anti-phishing, malware and impersonation protections configured and monitored? | Status; protected scope and exceptions |
| CLD-04 | Are email domain authentication protections configured and their results monitored? | Status; domains, SPF/DKIM/DMARC observations and policy |
| CLD-05 | Are mailbox forwarding and third-party application access controlled and reviewed? | Status; review date and exceptions |
| CLD-06 | Are security/audit logs enabled for required services and retained for business needs? | Coverage; services and retention periods |
| CLD-07 | Are exposed secrets identified, removed and replaced through a defined process? | Status; process and owner |

Suggested evidence: configuration summaries, sharing reviews, email protection/domain reports and logging settings.

## 8. Data protection and privacy

| ID | Question | Answer |
| --- | --- | --- |
| DAT-01 | Are sensitive data types, locations and owners documented? | Status; scope and last review |
| DAT-02 | Are access and sharing limited according to data sensitivity? | Status; exceptions |
| DAT-03 | Are classification/labeling and data-loss prevention controls used where needed? | Status for each; coverage and exclusions |
| DAT-04 | Are retention and deletion requirements documented and applied? | Status; data categories, periods and exceptions |
| DAT-05 | Is sensitive data encrypted in storage and transit where required? | Coverage for each; scope and exceptions |
| DAT-06 | Are data handling, privacy and contractual obligations identified and assigned an owner? | Status; applicable obligations and owner |
| DAT-07 | Is data securely removed when devices, accounts or services are retired? | Status; process and evidence |

Suggested evidence: data inventory, access/retention policies, control summaries and disposal records.

## 9. Monitoring, incident response and continuity

| ID | Question | Answer |
| --- | --- | --- |
| IR-01 | Who receives security alerts, and during what hours? | Text; internal/provider responsibility and escalation |
| IR-02 | What proportion of critical systems sends required security logs to monitored locations? | Coverage; sources and retention |
| IR-03 | Is there a documented incident response plan with named roles and contacts? | Status; last review date |
| IR-04 | When was the incident response plan last exercised, and were actions resolved? | Date; exercise outcome and remaining actions |
| IR-05 | Are legal, customer, insurer and provider notification responsibilities documented? | Status; responsible roles |
| IR-06 | Are continuity plans defined for critical service/provider outages? | Status; covered services and last exercise |
| IR-07 | What material incidents or recovery failures affect this assessment? | Text: period, impact and corrective actions; restricted visibility |

Suggested evidence: alert coverage, escalation runbooks, redacted exercise results and continuity plans.

## 10. Governance, people and suppliers

| ID | Question | Answer |
| --- | --- | --- |
| GOV-01 | Is an accountable person responsible for security policy and risk decisions? | YN; role |
| GOV-02 | Are security policies approved, communicated and reviewed? | Status; policy list and review dates |
| GOV-03 | What proportion of relevant personnel completed security awareness training in the required period? | Coverage; period and training scope |
| GOV-04 | Do personnel know how to report suspicious activity? | Status; reporting route and validation |
| GOV-05 | Are critical suppliers assessed for security, access and continuity risks? | Status; supplier scope and review date |
| GOV-06 | Are supplier responsibilities, incident contacts and exit/data-return arrangements documented? | Status; exceptions |
| GOV-07 | Are risks and exceptions recorded with owners, review dates and decisions? | Status; review frequency |
| GOV-08 | Is there a funded, prioritized plan for unresolved security and lifecycle work? | Status; owners and target dates |

Suggested evidence: policy register, training summary, supplier reviews, risk register and action plan.

## 11. AI agent and Copilot readiness

Repeat for each proposed or deployed AI product/use case. Do not assume every Copilot product
has the same prerequisites or that licensing alone establishes readiness.

| ID | Question | Answer |
| --- | --- | --- |
| AI-01 | Which AI agents/Copilot products are used or proposed, and for what business purpose? | Repeating product/use-case list; owner and deployment status |
| AI-02 | Are permitted uses, sensitive-data rules and human accountability defined? | Status; policy and owner |
| AI-03 | Have data access and oversharing been reviewed for the proposed scope? | Status; scope, review date and remaining actions |
| AI-04 | Have the selected product's prerequisites and licensing been validated? | Status; product-specific checklist/version and gaps |
| AI-05 | Are agent identities, tools, connectors and permissions approved with least privilege? | Status; inventory, scope and exceptions |
| AI-06 | Which actions can agents perform, and which require human approval? | Text; read/write/delete/external communication and approval boundaries |
| AI-07 | Are external data processing, retention and provider terms reviewed for this use case? | Status; approved data scope and unresolved issues |
| AI-08 | Have sensitive-data disclosure, untrusted input and unauthorized-action scenarios been tested? | Status; test scope, date and results |
| AI-09 | Are agent activity, access changes and failures monitored with a shutdown/revocation process? | Status; owner and process |
| AI-10 | Is there a controlled pilot, user training and an acceptance decision before broader rollout? | Status; success criteria and approval |

Suggested evidence: use-case register, access review, permission inventory, product-specific readiness
checklist, pilot/test results and operating procedures. General findings require product-specific validation.

## 12. Insurance and framework profile intake

These questions select the appropriate view and additional questionnaire. They do not establish
that this core catalog covers any insurer form, CMMC level or NIST publication in full.

| ID | Question | Answer |
| --- | --- | --- |
| PRF-01 | Which insurance provider, form edition and reporting period must be supported? | Text; form reference and due date |
| PRF-02 | Who is authorized to review insurance answers and approve sharing? | Text; roles and permitted recipients |
| PRF-03 | Which exact NIST framework/publication and version are requested? | Text; profile scope and intended use |
| PRF-04 | Which CMMC level and assessment scope are requested? | Text; assessor/adviser confirmation status |
| PRF-05 | Which systems, information types, boundaries and suppliers are in the framework scope? | Text; scope reference and exclusions |
| PRF-06 | Are prior assessments, approved exceptions or remediation plans available? | YN; references, dates and applicability |
| PRF-07 | What additional profile-specific questions or evidence remain unresolved? | Reviewer-maintained list linked to versioned criteria |

Only publish detailed profile conclusions after the selected criteria and mappings have been
reviewed. Framework scope and applicability require explicit review; generic security answers
alone cannot establish compliance or certification.

## 13. Review, grading and reporting requirements

Prepare for grading by retaining structured answers and measurable coverage. Do not assign an
arbitrary overall grade in this draft. Agree on targets and validate the scoring method first.

For each control evaluation, keep these separate:

| Dimension | Stored result |
| --- | --- |
| Conclusion | In place, Partly in place, Gap, Unknown, Not applicable |
| Evidence | Declared, Observed, Reviewer checked, Missing, Conflicting; linked supporting items |
| Collection | Complete, Partial, Failed, Not connected, Unsupported, or Not requested |
| Business priority | Impact, criticality, dependencies, owner and target date with rationale |
| Profile result | Selected criterion/version, applicable target, conclusion and unresolved evidence |

Future grading rules must be versioned and explain which questions contribute, applicability,
weights, thresholds, treatment of estimates, required evidence and missing/unknown responses.
Unknowns must remain visible and must not count as passes. Exclude only reviewer-justified
non-applicable items and disclose exclusions and assessment coverage. Questionnaire completion,
protection coverage and evidence confidence are distinct measurements.

Backup example: a company reports a strategy, 80 of 100 endpoints covered and daily backups.
Record 80% strategy coverage, then separately establish successful-job coverage, acceptable data
loss and restore-test results. Daily frequency alone does not establish adequacy. Without a restore
test, recovery remains unverified; without the business recovery target, adequacy remains unknown.
The same evidence can support several report views, but each profile applies its own reviewed criteria.

Reviewer completion requires confirming scope, reviewing evidence/conflicts and exclusions,
recording conclusions and actions, and identifying who approves the report. Approved reports
preserve the questionnaire, criteria/mapping versions, evidence dates and unresolved items.

## Next review decisions

Confirm the initial question set, required versus optional questions, asset grouping and expected
customer effort. Then produce one fictional company's completed assessment and four sample
report views, select exact initial profiles, and agree on the grading rubric before implementation.

Related: [product structure](product-structure-v3.md),
[primary requirements](../tenant-security-check-requirements.md).
