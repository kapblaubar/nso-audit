"""Build the source-based SQL table dictionary; no database connection or credentials.
Run: python scripts/build-data-dictionary.py [--check]
Descriptions and access paths are reviewed annotations, not inferred authorization rules.
"""
from pathlib import Path
import re, csv, io, sys
ROOT=Path(__file__).resolve().parents[1]
# purpose, group, main read path, main write path, status/notes
D={}
def add(table,purpose,group,read,write,notes='Active; contains application data.'):
 D[table]=(purpose,group,read,write,notes)
A='accounts.ts: accounts â€” /api/account/{action}'
C='customers.ts: manageCustomers â€” /api/management/customers[/{organizationId}]; customerStore.ts: listCustomers/getCustomer/saveCustomer'
Q='questionnaires.ts: questionnaires/load/catalog â€” GET /api/me/questionnaires[/{assessmentId}]'
QW='questionnaires.ts: questionnaires/insertAnswer â€” POST /api/me/questionnaires; PUT /api/me/questionnaires/{assessmentId}'
F='clientAssessments.ts: clientAssessments/loadClientAssessment â€” GET /api/me/client-assessments[/{assessmentId}]'
FW='clientAssessments.ts: clientAssessments/insertAnswer â€” POST/PUT /api/me/client-assessments and /{assessmentId}/groups[/{groupId}]'
S='sqlTenantStore.ts: getTenantBootstrap/getStarterScan/listTenantScans â€” bootstrap, getScan, listScans handlers'
W='dataAudits.ts: collectAuditData timer -> audits/store.ts: checkpointCollection (insertPage)'
R='dataAudits.ts: readEvidence â€” GET /api/me/audits/{scanId}/{dataType} -> audits/store.ts: getSnapshotRows'
add('identitydata.Users','Customer email accounts: identity, password hash, verification and disabled state.','Accounts',A+'; testAccounts.ts: testAccounts; questionnaire/audit authorization',A+' via AuthRegister/AuthCompleteToken/AuthAcceptInvitation; Dev account cleanup via ManagementDeleteAccount','Sensitive: password hashes and personal information; never plaintext passwords.')
add('identitydata.RegistrationRequests','Original registration-review requests linked to an email user.','Accounts','No normal registration-review API found; Dev account cleanup references it.','No active business create/update handler found; ManagementDeleteAccount deletes dependent requests.','Foundation/reserved workflow; not the active invitation workflow. Empty does not imply safe to drop.')
add('identitydata.Sessions','Hashed email login sessions, expiration and revocation.','Accounts',A+' via AuthSession; requireAuditUser via AuthResolveAudit; resolveQuestionnaireUser via AuthResolveQuestionnaire',A+' via AuthLogin/AuthSession; password reset/account cleanup revoke or delete sessions.','Sensitive session hashes; operational authentication state, not audit snapshots.')
add('identitydata.AccountTokens','Hashed one-time email verification and password-reset tokens.','Accounts',A+' via AuthCompleteToken',A+' via AuthRegister/AuthIssueToken/AuthCompleteToken; cleanup via ManagementDeleteAccount','Sensitive token hashes, purposes, expiry and use times; not recoverable email links.')
add('identitydata.ManagementUsers','Approved Entra staff principals and setupAdmin/platformAdmin roles.','Accounts','management.ts: managementBootstrap -> GetManagementRole; management stored procedures check it.','scripts/database.mjs bootstrap-management; no normal customer-facing writer.','Security configuration, distinct from customer accounts and organization memberships.')
add('identitydata.WorkspaceInvitations','Hashed workspace invitation tokens, invited email/role, expiry, acceptance and delivery state.','Accounts',A+' via AuthInspectInvitation/AuthAcceptInvitation; management customer read procedures','customers.ts: inviteContact -> ManagementInviteContact/ManagementInvitationDelivery; accounts -> AuthAcceptInvitation','Sensitive invitation hashes and personal information; email delivery is separate from acceptance.')
add('security.AuthAttempts','Hashed rate-limit buckets and request windows for account operations.','Access',A+' -> AuthThrottle',A+' -> AuthThrottle; ManagementDeleteAccount cleanup','Operational anti-abuse counters, not audit history.')
add('security.Memberships','Email user roles within each organization: owner/admin/contributor/viewer.','Access','AuthSession/AuthResolveAudit/AuthResolveQuestionnaire; account/management authorization','ManagementActivateContact/AuthAcceptInvitation/ManagementSaveCustomer; ManagementDeleteAccount','Security catalog; access changes affect authorization immediately.')
add('security.EntraConnections','Approved mapping of a Microsoft tenant to an NSO customer organization.','Access','sqlTenantStore.ts: withTenant/getTenantBootstrap -> ResolveEntraOrganization; AuthResolveAudit','Operator mapping/backfill tooling in scripts/migrate-table-data.mjs; no public self-provisioning API.','TenantId is not OrganizationId. Do not reuse Dev mappings in Prod.')
add('security.WorkspaceOwnershipRequests','Operator-nominated pending/fulfilled customer workspace ownership requests.','Access','ManagementGetCustomer; operator Request-NsoAuditWorkspaceOwner.mjs; cleanup procedures','scripts/Request-NsoAuditWorkspaceOwner.mjs; management/account procedures where referenced below','Controlled ownership workflow; inspect procedure references before changing state.')
add('security.CustomerDirectory','Management directory of organizations, primary contact and concurrency revision.','Customers',C+' via ManagementListCustomers/ManagementGetCustomer',C+' via ManagementSaveCustomer; contact/account/invitation procedures update revisions','Privileged management lookup, not unrestricted tenant evidence. Revision protects against stale saves.')
add('app.Organizations','NSO customer/workspace identity and active/suspended state.','Customers',C+'; account authorization; questionnaire/audit ownership',C+' -> ManagementSaveCustomer; operator organization/bootstrap tooling','Root customer record. Deleting it can affect many dependent records.')
add('app.CustomerProfiles','Extended customer profile as structured JSON, keyed by organization.','Customers',C+' -> ManagementGetCustomer',C+' -> ManagementSaveCustomer','Current customer configuration, not a month-by-month snapshot.')
add('app.CustomerContacts','Customer contact roster, intended roles and account/invitation links.','Customers',C+'; account/invitation procedures',C+'; customers.ts activateContact/inviteContact; accounts invitation acceptance; Dev account cleanup','Roster entry and active membership are different concepts.')
add('app.Assessments','Parent record for manually completed questionnaires: template version, state and creation time.','Questionnaires',Q+'; '+F,QW+'; '+FW,'AssessmentId is for questionnaire assessments; ScanId is for automated audits.')
add('app.Answers','Original generic JSON answer model under an assessment.','Questionnaires','No current form reads found; active forms use QuestionnaireAnswers or ClientAssessmentAnswers.','No current form writer found; ManagementDeleteAccount nulls UpdatedBy while preserving historical answers.','Legacy/foundation model. UpdatedBy became nullable in migration 010.')
add('app.AuditEvents','Application activity log: actor, action and event time, such as customer edits or questionnaire saves.','Questionnaires','No normal event-list HTTP API found; operator inspection.', 'questionnaires.ts: audit; clientAssessments.ts: audit; management/invitation procedures; ownership tool','Activity log, NOT collected Microsoft audit evidence. Dev account cleanup can remove user-attributed events.')
for table,purpose in {
 'questionnaire.Questions':'Versioned question prompts, answer types, positions and template membership.',
 'questionnaire.QuestionOptions':'Allowed option IDs/labels for each versioned question.',
 'questionnaire.ClientSections':'Versioned client-assessment section definitions, repeatability and presentation metadata.',
 'questionnaire.ClientQuestionDefinitions':'Versioned detailed question metadata, section mapping, source IDs and definition JSON.'}.items():
 add(table,purpose,'Questionnaire catalog',Q+'; '+F if table.endswith(('Questions','QuestionOptions')) else F,'Versioned migrations 013â€“016 via scripts/database.mjs migrate; generated questionnaire catalog scripts.','Shared reference definitions, not customer answers. Preserve versions used by saved assessments.')
for table,purpose in {
 'app.QuestionnaireScopes':'Backup questionnaire scope: name, asset class, tenant and optimistic revision.',
 'app.QuestionnaireAnswers':'Typed answers and evidence references for the original backup questionnaire.',
 'app.QuestionnaireAnswerSelections':'One selected option per row for multi-select backup answers.'}.items():add(table,purpose,'Questionnaires',Q+('; '+F+' lists prior backup scopes' if table.endswith('Scopes') else ''),QW,'Organization/AssessmentId scoped; edits replace/update current answers, not automatic audit snapshots.')
for table,purpose in {
 'app.ClientAssessmentDetails':'Client questionnaire header, name, owner/reviewer labels and optimistic revision.',
 'app.ClientAssessmentGroups':'Named section instances, including repeatable technology or asset groups and context JSON.',
 'app.ClientAssessmentAnswers':'Typed answers, record-list JSON, provenance and supporting evidence references per group/question.',
 'app.ClientAssessmentSelections':'Multi-select options linked to an answer in a specific assessment group.',
 'app.ClientAssessmentReviews':'Reviewer conclusions, evidence/collection states and review metadata per group/question.'}.items():add(table,purpose,'Questionnaires',F,FW+('; clientAssessmentReview â€” PUT /api/me/client-assessments/{assessmentId}/groups/{groupId}/reviews/{questionId}' if table.endswith('Reviews') else ''),'Versioned template plus organization/assessment/group keys; questionnaire changes are not automatic Graph pulls.')
add('app.TenantRegistrations','Tenant setup/access-check JSON and pointer to the latest scan.','Audit control',S,'accessCheck.ts: accessCheck -> saveAccessCheck/mergeRegistration; saveStarterScan; audits/store.ts: createDataAudit','Current setup pointer/state; not the source of all historical audits.')
add('app.ScanRuns','Common scan-history envelope for both older scorecards and current typed audits.','Audit control',S,'scans.ts: startScan -> createDataAudit or saveStarterScan; startCollection/checkpointCollection update status JSON','Shared ScanId links to DataAudits. Historical JSON scans need not have a DataAudits row.')
add('app.ScanFindings','Legacy scorecard findings and saved finding evidence JSON per scan/check.','Audit control','scans.ts: getScan -> getStarterScan','scans.ts: startScan -> saveStarterScan when unified collection is disabled; migration/backfill tooling','Historical/fallback model; new typed evidence is stored in dedicated Audit* tables, not here.')
add('app.DataAudits','Typed audit header: scope, initiator, collector version, subscription, lifecycle and timestamps.','Audit control','dataAudits.ts: readAudit -> getDataAudit; worker getJobSubscription','scans.ts: startScan and dataAudits.ts: createAudit -> createDataAudit; timer -> startCollection/checkpointCollection','One typed run; completed evidence retained as a snapshot. A complete run covers its requested datasets only.')
add('app.AuditCollections','Per-audit dataset status, row count, start/end timestamps and safe error code.','Audit control','dataAudits.ts: readAudit -> getDataAudit; nextIntuneParent; queue procedures','createDataAudit creates requested datasets; startCollection/checkpointCollection update progress','Distinguish empty complete, missingAccess, failed and partial. This is dataset status, not individual evidence.')
add('dbo.AuditCollectionJobs','Durable worker queue: audit/dataset, paging cursor, lease, attempt count and finished flag.','Audit control','collectAuditData -> claimCollection -> ClaimAuditCollection; LockAuditCollection','createDataAudit -> EnqueueAuditCollection; ClaimAuditCollection and CheckpointAuditCollection','Operational queue. Do not manually flip Finished or edit cursors to fix a report; leases fence stale workers.')
add('dbo.AuditDatasetDependencies','Static child-to-parent dataset dependency map for Intune collection order.','Audit control','collectAuditData -> ClaimAuditCollection','Migration 019 via scripts/database.mjs migrate; no runtime writer.','Reference configuration, not tenant evidence. Children wait for parent inventory to become terminal.')
add('dbo.ScanStorageCutover','Single-row guard identifying the active scan backend and migration verification metadata.','Audit control','assertSqlCutoverActivated -> GetScanStorageState; SQL audit paths and health checks where applicable','scripts/migrate-table-data.mjs activate; Complete-NsoAuditSqlCutover.ps1 orchestrates cutover','Operational migration guard; SQL is the approved current backend. Not a customer setting.')
add('dbo.SchemaMigrations','Applied migration filenames, normalized SHA-256 checksums and application timestamps.','Audit control','scripts/database.mjs migrate','scripts/database.mjs migrate creates/updates ledger in the migration transaction.','Created by migration runner, not a numbered migration. Never edit checksums to hide drift.')
add('app.AuditLicenses','Tenant subscribed license SKU inventory: purchased/enabled/suspended/warning units and consumed counts.','Collected evidence','readEvidence -> getLicenseRows (dataType=licenses)',W+' via processCollection/fetchLicensePage/normalizeLicenses','Snapshot per audit; Graph GET /v1.0/subscribedSkus. Product names may fall back to SKU.')
add('app.AuditLicenseAssignments','User-to-SKU assignment paths: direct/group, state/error and disabled plans.','Collected evidence','readEvidence -> getLicenseRows (dataType=licenseAssignments)',W+' via processCollection/fetchLicensePage/normalizeAssignments','Snapshot per audit; Graph GET /v1.0/users with selected licensing fields. Rows are assignment paths, not unique users.')
# Reviewed static catalog supplies exact remote paths and child relationships.
cat=(ROOT/'apps/api/src/audits/catalog.ts').read_text()
for m in re.finditer(r"(\w+):\{table:'(\w+)',label:'([^']+)',category:'([^']+)',path:'([^']+)'([^\n]*)",cat):
 key,table,label,category,path,tail=m.groups();parent=re.search(r"parent:'([^']+)'",tail);relationship=re.search(r"relationship:'([^']*)'",tail)
 endpoint=('ARM GET /subscriptions/{subscriptionId}' if 'arm:true' in tail else 'Graph GET ')+path
 if parent: endpoint+='/{policyId}'+('/'+relationship.group(1) if relationship and relationship.group(1) else '')+('?$expand=settingDefinitions' if 'expandDefinitions:true' in tail else '')
 purpose=label+'. Saved source evidence, not an automatically evaluated compliance finding.'
 if key=='authenticationMethods':purpose='Authentication-method root policy and returned method configurations; not user authentication secrets.'
 if key=='roleAssignments':purpose='Entra directory role assignments captured per audit, including expanded role definition and principal in SourceJson for new audits; DisplayName is the role name. Does not expand group membership or collect PIM eligibility.'
 if key=='secureScores':purpose='Microsoft Secure Score source history returned during an audit; several historical source scores may belong to one NSO audit.'
 if key in ('secureScoreProfiles','defenderMetadata'):purpose=label+'. Reference/control definitions captured with the audit; not evidence that each control is implemented.'
 notes='Snapshot; '+category+'. '+endpoint+'.'
 if parent: notes+=' Parent dataset: '+parent.group(1)+'. Child IDs are local to a policy; ParentSourceId links within the same organization, tenant and ScanId.'
 add('app.'+table,purpose,'Collected evidence',R+' (dataType='+key+')',W+(' via nextIntuneParent/fetchIntuneChildPage' if parent else ' via collectSnapshot/fetchSnapshotPage'),notes)

migrations={p.name:p.read_text(encoding='utf-8') for p in sorted((ROOT/'database/migrations').glob('*.sql'))}
created={};ddl={};procedures={}
for file,text in migrations.items():
 for m in re.finditer(r'CREATE TABLE\s+(\w+\.\w+)\s*\(',text,re.I):
  name=m.group(1);start=m.end();depth=1;i=start;quote=False
  while i<len(text) and depth:
   c=text[i]
   if c=="'":
    if quote and i+1<len(text) and text[i+1]=="'":i+=2;continue
    quote=not quote
   if not quote:depth+=1 if c=='(' else -1 if c==')' else 0
   i+=1
  created[name]=file;ddl[name]=text[start:i-1]
 for batch in re.split(r'^\s*GO\s*$',text,flags=re.M|re.I):
  m=re.search(r'(?:CREATE(?: OR ALTER)?|ALTER) PROCEDURE\s+(\w+\.\w+)',batch,re.I)
  if m:procedures[m.group(1)]=(file,batch)
created['dbo.SchemaMigrations']='scripts/database.mjs'
assert set(created)==set(D),f'Missing/extra descriptions: {set(created)^set(D)}'

def link(path):return f'[{path}](../{path})'
def sources(table):
 paths=[]
 for p in (ROOT/'apps/api/src').rglob('*.ts'):
  if not p.name.endswith('.test.ts') and (table in p.read_text(encoding='utf-8') or p.name in D[table][2]+' '+D[table][3]):paths.append(p.relative_to(ROOT).as_posix())
 if D[table][1]=='Collected evidence':paths+=['apps/api/src/audits/store.ts','apps/api/src/functions/dataAudits.ts','apps/api/src/audits/catalog.ts']
 return sorted(set(paths))
intro='''# NSO Audit data dictionary

Source inventory: November 10, 2026, migrations 001â€“019 and current API code. Covers **62 project tables** (61 migration-defined tables plus the migration ledger).
This documents the existing Dev application database `nso-audit-dev` in `NSO-Audit`. It is not a temporary database.
This is a **source-based dictionary**, not a fresh live-schema reconciliation. SQL tooling/system tables installed separately are not assumed to belong to this application.
Run [inspect-schema.sql](inspect-schema.sql) in SSMS to inspect the actual connected database's columns, keys, descriptions and dependencies without reading customer data or changing anything.

## Start here in SSMS

| You want to understandâ€¦ | Start with |
| --- | --- |
| Which automated audits ran | `app.DataAudits`, then `app.ScanRuns` for all current/older history |
| Whether a dataset actually collected successfully | `app.AuditCollections` |
| The actual saved Microsoft configurations | Dedicated `app.Audit*` evidence tables below |
| Why collection is queued/running | `dbo.AuditCollectionJobs` and `app.AuditCollections` |
| Which customer owns the data | `app.Organizations` and `security.EntraConnections` |
| Who can sign in/access a workspace | `identitydata.Users`, `identitydata.Sessions`, `security.Memberships` |
| Manually entered questionnaire answers | `app.Assessments`, `app.ClientAssessment*`, or `app.Questionnaire*` |
| Which SQL changes have been applied | `dbo.SchemaMigrations` |

**An automated audit is not a questionnaire assessment.** `ScanId` identifies a collected audit snapshot; `AssessmentId` identifies a questionnaire. `app.AuditEvents` is an application activity log, not the Microsoft evidence collected by an audit.

## Schemas and common identifiers

| Schema | Meaning |
| --- | --- |
| `app` | Customer data, questionnaires, audit headers and collected evidence |
| `identitydata` | Email accounts, session/token hashes, invitations and management principals |
| `security` | Access mappings, membership, throttling and controlled SQL procedures |
| `questionnaire` | Shared, versioned question/section/option definitions |
| `dbo` | Operational queue, dependency map, cutover guard and migration ledger |

| Column/key | Meaning |
| --- | --- |
| `OrganizationId` | NSO customer/workspace boundary; not the Microsoft tenant ID |
| `TenantId` | Microsoft Entra tenant being audited |
| `ScanId` | Shared automated audit identifier across header, collections and evidence |
| `AssessmentId` | Manually completed questionnaire identifier |
| `SourceId` | Stable source identity; Intune child rows use a deterministic parent/child hash |
| `ParentSourceId`, `ChildSourceId` | Original Intune policy and child IDs; join using organization + tenant + scan + parent ID |
| `CollectedAtUtc`, `StoredAtUtc` | When evidence was observed versus persisted; not the source object's creation date |
| `SourceCreatedAtUtc`, `SourceUpdatedAtUtc` | Source-supplied object dates where available |
| `SourceJson`, `EntityJson`, `DefinitionJson` | Additional saved source evidence, legacy envelope, or catalog metadata respectively |
| `Revision` / management `Version` | Optimistic concurrency protection for edited forms/profiles |

Most customer `app` tables use organization row-level security (RLS). Security/identity/queue tables use restricted permissions and controlled procedures instead; do not assume every table has identical RLS.
A blank result in SSMS can be caused by organization context, not an empty database. The metadata script reports the predicates; it does not set an organization context or bypass isolation.
Never join customer data using a source ID alone. Completed snapshots should remain historical evidence, even in Dev. Schema/data cleanup is allowed when explicitly planned, but dependencies and recovery need to be understood.

## API/function legend

All HTTP paths below are on the existing Function API, with `/api` prefix. File names refer to `apps/api/src/functions/` unless another directory is given. These are **our application API endpoints**; Microsoft Graph/ARM paths are listed separately as collection sources.

| Path / trigger | Registered function / handler | SQL helper |
| --- | --- | --- |
| POST `/api/me/scans` | `startScan` | `audits/store.ts:createDataAudit` for unified audits; `saveStarterScan` for fallback |
| GET `/api/me/scans`, `/{scanId}` | `listScans`, `getScan` | `sqlTenantStore.ts:listTenantScans/getStarterScan` |
| POST `/api/me/audits` | `createDataAudit` / handler `createAudit` | `audits/store.ts:createDataAudit` (license-only entry) |
| GET `/api/me/audits/{scanId}` | `readDataAudit` / handler `readAudit` | `getDataAudit` |
| GET `/api/me/audits/{scanId}/{dataType}` | `readAuditEvidence` / handler `readEvidence` | `getSnapshotRows/getLicenseRows` |
| Every minute timer | `collectAuditData` | Claim -> start -> source page -> checkpoint; browser does not write evidence |
| GET `/api/me/bootstrap`; POST `/api/me/access-check` | `bootstrap`, `accessCheck` | `getTenantBootstrap/saveAccessCheck` |
| GET/POST `/api/account/{action}` | `customerAccounts` / handler `accounts` | `security.Auth*` procedures |
| `/api/management/customers[/{organizationId}]` | `managementCustomers/managementCustomer` / handler `manageCustomers` | `management/customerStore.ts` -> `security.Management*` |
| POST customer contact `/activate` or `/invite` | `activateCustomerContact/inviteCustomerContact` / handlers `activateContact/inviteContact` | Controlled contact/invitation procedures |
| GET/DELETE `/api/management/test-users[/{userId}]` | `listTestAccounts/deleteTestAccount` / handler `testAccounts` | Dev account cleanup procedures |
| `/api/me/questionnaires[/{assessmentId}]` | `questionnaires/questionnaire` / handler `questionnaires` | Direct scoped SQL and catalog/load/insertAnswer helpers |
| `/api/me/client-assessments/...` | `clientAssessments/clientAssessment/clientAssessmentGroups/clientAssessmentGroup/clientAssessmentReview` | `clientAssessments`, `loadClientAssessment`, insertAnswer helpers |

## How the main records connect

```mermaid
flowchart TD
  O[app.Organizations] --> E[security.EntraConnections]
  E --> S[app.ScanRuns]
  S --> A[app.DataAudits]
  A --> C[app.AuditCollections]
  C --> J[dbo.AuditCollectionJobs]
  A --> P[Dedicated audit evidence tables]
  P --> I[Intune child settings and assignments]
  O --> Q[app.Assessments]
  Q --> F[ClientAssessment / Questionnaire answers]
```

This is a conceptual map; exact declared foreign keys appear under each table and in the SSMS metadata script.

## Table inventory

The following describes normal application access plus important operator paths. Verification/fixture scripts may also touch tables and are not normal business writers. SQL procedure references include both reads and writes; consult the linked implementation for individual statements and later dynamic procedure alterations.

'''
rows=[];out=[intro]
out.append('| Table | Area | What it stores |\n| --- | --- | --- |\n')
for table in sorted(D):
 out.append(f'| [{table}](#{table.replace(chr(46),'').lower()}) | {D[table][1]} | {D[table][0]} |\n')
out.append('\n')
for group in ['Audit control','Collected evidence','Customers','Accounts','Access','Questionnaire catalog','Questionnaires']:
 out.append(f'### {group}\n\n')
 for table in sorted(t for t in D if D[t][1]==group):
  purpose,_,read,write,notes=D[table];file=created[table];body=ddl.get(table,'')
  pk=re.search(r'PRIMARY KEY(?: NONCLUSTERED| CLUSTERED)?\s*\(([^)]+)\)',body,re.I)
  if pk:key=pk.group(1)
  else:
   inline=[line.strip().split()[0] for line in body.splitlines() if 'PRIMARY KEY' in line.upper()]
   key=', '.join(inline) if inline else ('Name' if table=='dbo.SchemaMigrations' else 'See linked DDL')
  refs=sorted(set(re.findall(r'REFERENCES\s+(\w+\.\w+)\s*\(([^)]+)\)',body,re.I)))
  relations='; '.join(f'{t} ({k})' for t,k in refs) or 'No table foreign key in original CREATE TABLE; see later migrations/live metadata.'
  touched=[name for name,txt in migrations.items() if table in txt]
  proc=[f'{name} ({f})' for name,(f,txt) in procedures.items() if re.search(r'\b'+re.escape(table)+r'\b',txt)]
  out.append(f'#### {table}\n\n- **Stores:** {purpose}\n- **Read by:** {read}\n- **Written by:** {write}\n- **Primary key (creation DDL):** `{key}`\n- **Parent relationships (creation DDL):** {relations}\n- **Lifecycle / cautions:** {notes}\n')
  out.append('- **Schema sources:** '+', '.join(link('database/migrations/'+f) for f in touched) if touched else '- **Schema source:** '+link(file))
  out.append('\n')
  src=sources(table)
  if src:out.append('- **Application implementation:** '+', '.join(link(p) for p in src)+'\n')
  if proc:out.append('- **SQL procedures referencing this table:** '+ '; '.join('`'+v+'`' for v in proc)+'\n')
  out.append('\n')
  rows.append([table,purpose,group,read,write,key,relations,notes,file])
out.append('''## Maintenance and useful next additions

- Keep this dictionary and migrations in the same change. `python scripts/build-data-dictionary.py` rebuilds the Markdown/CSV; `--check` detects stale output or missing table descriptions. Update the reviewed descriptions/access paths when behavior changes.
- The [CSV](data-dictionary.csv) gives one row per table for Excel filtering by area or reader/writer.
- The [SSMS metadata script](inspect-schema.sql) gives live columns, nullability, defaults, keys, indexes, RLS and SQL dependencies. SQL dependency metadata does not include TypeScript-built dynamic SQL; this dictionary provides that missing application mapping.
- A useful next enhancement is SQL `MS_Description` extended properties for table/column descriptions, delivered by a migration so SSMS can show them directly. They have not been applied by this documentation task.
- Define retention/archive rules separately for immutable audit evidence, operational jobs, activity logs and authentication tokens. No new retention or purge schedule is implied here.
- Before November/December comparisons, use ScanId + dataset completeness + original source IDs. Compare source configuration, not collection dates or job metadata. Historical scans can have different supported datasets.

No live table contents, credentials or customer examples are included. No database schema, data, permissions, firewall or deployment changes were made to produce this dictionary.
''')
md=''.join(out)
buf=io.StringIO(newline='');writer=csv.writer(buf,lineterminator='\n');writer.writerow(['TableName','WhatItStores','Area','ReadAPIAndFunction','WriteAPIAndFunction','PrimaryKeyAtCreation','ParentRelationshipsAtCreation','LifecycleAndNotes','CreatedBy']);writer.writerows(rows)
for filename,content in [('data-dictionary.md',md),('data-dictionary.csv',buf.getvalue())]:
 path=ROOT/'database'/filename
 if '--check' in sys.argv:
  assert path.exists() and path.read_text(encoding='utf-8')==content,f'Stale output: {path}'
 else:path.write_text(content,encoding='utf-8')
print(f'{"Checked" if "--check" in sys.argv else "Wrote"} dictionary for {len(D)} tables.')
