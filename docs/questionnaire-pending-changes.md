# Pending questionnaire changes

Recorded 2026-10-23. These requirements were approved for implementation. The local implementation uses
client-v2 / question version 3 and migration 015; deployment is still pending.
Preserve saved answers and version schema/catalog changes through forward migrations;
do not rewrite the applied client-v1 catalog or migration 014.

## Environment selection and details

- Combine environment selection and environment details into one guided flow.
- Allow multiple selected platforms for hybrid clients: Microsoft 365 / Azure, AWS,
  Google Workspace / Google Cloud, on-premises and Other.
- Reveal only relevant fields: Microsoft tenants/domains and Azure subscriptions;
  AWS accounts/regions; Google Workspace domains and Cloud organizations/projects;
  on-premises sites/locations and directory domains; custom platform identifiers.
- Support multiple tenants, subscriptions, accounts, projects and sites per client.
- Allow unknown identifiers to remain blank.

## Business activities and supporting systems

- Replace the empty generic record form with suggested activities users can select:
  email/communication, customer orders/sales, accounting/payroll, production/service
  delivery, scheduling/appointments, file storage/document sharing, website/online
  store and Other.
- Open a short form per selected activity with software/system names and examples,
  an optional responsible person, and how long the business could manage without it:
  a few hours, one day, a few days, a week or more, or Not sure.
- Support multiple systems and custom activities. Use Add business activity.

## MSP and supplier responsibilities

- Keep multiple providers, with a multi-select What does this provider manage? list:
  Microsoft 365; Azure; AWS; Google Workspace / Google Cloud; software licensing;
  user accounts/access; cybersecurity monitoring/response; email security;
  computers/mobile devices; servers/virtualization; networks/Wi-Fi/firewalls;
  backups/recovery; databases; reporting/business intelligence; applications/
  integrations; websites/hosting; phones/communications; help desk/user support;
  compliance/security advice; Other with description.
- Keep provider name, optional Specific systems covered with examples, and optional
  Support contact or escalation details. Use Add another provider.

## Sensitive information storage — confirmed

- Ask Where do you keep sensitive information?
- Capture actual storage systems and locations, rather than sensitivity labels.
  Classification/protection labels such as Confidential are a separate concept.
- Offer information types: employee, customer, financial, health, payment,
  intellectual property and Other.
- Offer storage systems: SharePoint, OneDrive, Teams, email, file server, database,
  business application and Other.
- Include optional Site, folder or application name, with an example such as
  HR SharePoint site. An exact URL is not required.
- Include optional Person or team responsible.
- Start with the storage location, then select all information types stored there.
- Use one location card containing system, optional site/folder/application name,
  a multi-select information-type checklist and optional responsible person/team.
- Allow multiple locations with Add another storage location.
- Existing API/SQL rows remain compatible: the UI groups matching location details
  and expands selected data types back into the versioned rows when saving.

## Assessment purposes

- Ask What would you like this assessment to help with? Select all that apply:
  understand security risks, improve IT setup, apply for/renew cyber insurance,
  prepare for customer/compliance requirements, prepare for AI tools, Not sure -
  help us decide, and Other.
- Reveal relevant follow-ups per purpose. Allow multiple insurers, forms, customer
  requirements and frameworks. Exact versions are optional and can be confirmed later.

## Version and compatibility

New assessments use client-v2 with five guided forms. The redundant environment,
sensitive-information and report-purpose multi-select questions are combined into
those forms rather than shown separately. Version 1 remains supported unchanged.
Existing drafts expose Create guided copy. This creates a new draft, carries forward
compatible answers and previous details, and preserves the original assessment and
all its reviews. Existing criticality is retained as previous details; it is not
converted into a guessed recovery time. Review conclusions and reviewer-only answers
that the copying user cannot edit are not copied. Review the original for those records.
No database rebuild is needed. See database/guided-questionnaires.md for deployment.

## Deferred: insurer document upload and import

Retain as a future requirement; do not implement in the current storage-form change.
Allow PDF, Word and Excel insurer questionnaires to be attached and their questions/
answer choices imported after a review preview. Keep original documents, support
multiple insurers/forms, and flag unreadable content or scanned pages requiring OCR.
Imported insurer questions should sit alongside the standard assessment questions.
