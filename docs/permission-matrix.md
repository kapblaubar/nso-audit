# NSO Audit permission matrix

This document maps each planned assessment capability to its authorization mechanism. The live
App Registration must request only permissions used by deployed scanner modules; this matrix is
the target catalog, not permission to enable every entry immediately.

## Enterprise Application API permissions

| Assessment capability | API | Application permission | Stage | Notes |
|---|---|---|---|---|
| Entra directory roles and assignments | Microsoft Graph | `RoleManagement.Read.Directory` | Core | No write access; avoid `Directory.Read.All` unless a future implemented check proves it necessary |
| Privileged assignee names and email addresses | Microsoft Graph | `User.ReadBasic.All` | Core | Resolves the basic profile of user principals returned by role assignments without full-directory profile access |
| Conditional Access policies | Microsoft Graph | `Policy.Read.All` | Core | Read policies only |
| Authentication registration coverage | Microsoft Graph | `AuditLog.Read.All` | Core | Reads the authentication-method registration report |
| Microsoft 365 Secure Score and control recommendations | Microsoft Graph | `SecurityEvents.Read.All` | Core | Reads score history and control profiles |
| Intune device compliance, configuration policies, and security baselines | Microsoft Graph | `DeviceManagementConfiguration.Read.All` | Scorecard | No `ReadWrite` variant |
| Intune app configuration and app-protection policies | Microsoft Graph | `DeviceManagementApps.Read.All` | Scorecard, only if these checks ship | Do not request merely for device configuration checks |
| Defender Vulnerability Management score | WindowsDefenderATP | `Score.Read.All` | Optional scorecard | Requires the relevant Defender licensing and API availability |
| Defender Vulnerability Management recommendations | WindowsDefenderATP | `SecurityRecommendation.Read.All` | Optional scorecard | Read-only; do not request machine/software/vulnerability permissions unless corresponding checks ship |
| Dashboard sign-in | Microsoft Graph | delegated `User.Read` | Core | Used by the interactive user session, not the unattended scanner |

Explicitly excluded unless a later implemented check is approved:

- All `ReadWrite` permissions
- `Mail.Read`, `MailboxSettings.Read`, and Exchange mailbox permissions
- `Group.Read.All`, `GroupMember.Read.All`, and broad directory permissions
- Defender machine, software inventory, alert, and vulnerability permissions
- Intune managed-device inventory permission when only policy configuration is assessed

## Azure RBAC assigned to the customer Enterprise Application

Microsoft Graph consent does not grant Azure Resource Manager access. Customers assign these
roles separately and scope them to selected subscriptions, workspaces, or vaults.

| Assessment capability | Azure role | Recommended scope | Stage |
|---|---|---|---|
| Enumerate Azure resources and inspect configuration | `Reader` | Selected subscription or resource group | Scorecard |
| Defender for Cloud secure score and security recommendations | `Security Reader` | Selected subscription | Scorecard |
| Recovery Services vault configuration, policies, and protected-item posture | `Backup Reader` | Selected Recovery Services vault | Scorecard |
| Log Analytics workspace configuration and log queries | `Log Analytics Reader` | Selected workspace | Scorecard |
| Microsoft Sentinel configuration and data connectors | `Microsoft Sentinel Reader` | Selected Sentinel-enabled workspace | Scorecard |

Do not assign these roles at management-group or tenant-root scope by default. The onboarding
script must support explicit subscription, resource-group, workspace, and vault selections and
must show every proposed assignment with `-WhatIf`.

## Purview DLP limitation

Full Microsoft Purview DLP policy configuration is not currently treated as an unattended SaaS
scanner module. There is no approved narrow Microsoft Graph application permission in this
design for reading the complete DLP policy set. App-only Security & Compliance PowerShell can
require `Exchange.ManageAsApp` plus separate compliance/Exchange RBAC, which is broader and more
operationally complex than the product's current read-only consent promise.

Interim approach:

1. Provide a customer-run, read-only PowerShell export for DLP policy metadata.
2. Display the exact commands and output fields before execution.
3. Let the customer review the output before uploading it.
4. Do not request `Exchange.ManageAsApp` in the central Enterprise Application without a new
   security review and explicit product decision.

## Scorecard inputs

The scorecard can combine:

- Microsoft 365 Secure Score and control profiles
- Defender for Cloud secure score and recommendations
- Optional Defender Vulnerability Management score and recommendations
- Entra role, Conditional Access, and authentication-registration checks
- Intune policy coverage and configuration checks
- Recovery Services vault protection/settings checks
- Log Analytics required-log presence and freshness
- Sentinel data-connector configuration and health indicators
- Customer-supplied DLP policy metadata until a suitably narrow supported API is approved

Every score must retain its source, collection timestamp, completion state, licensing status,
and permission status. Missing permissions, missing licenses, unsupported APIs, and collection
errors must produce `Incomplete` or `NotApplicable`, never a failing security score of zero.
