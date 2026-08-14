# Identity, consent, and Azure RBAC model

NSO Audit separates three identities and authorization decisions. They must not be presented as
one broad "connect everything" step.

## 1. Dashboard user

The dashboard user signs in with a normal Microsoft organizational account. This establishes
the home tenant and authorizes access to that tenant's NSO Audit dashboard data.

- Do not recommend Global Administrator for routine dashboard access.
- Delegated `User.Read` supports basic sign-in only.
- Signing in does not grant the scanner access to Microsoft Graph tenant data.

## 2. Tenant consent administrator

Tenant-wide application consent is completed separately on Microsoft's consent endpoint. An
authorized administrator may use a different account from the dashboard user.

- The privileged account authenticates directly with Microsoft, not an NSO Audit credential form.
- The Microsoft page displays the requested application permissions before approval.
- Approval creates the NSO Audit Service Principal, shown as an Enterprise Application, in the
  customer tenant.
- The privileged account must not replace the normal dashboard session.
- NSO Audit independently verifies consent before allowing a scan.

Phase 1 application permissions are limited to:

| Permission | Purpose |
|---|---|
| `Policy.Read.All` | Read Conditional Access policies |
| `AuditLog.Read.All` | Read authentication-method registration reports |
| `RoleManagement.Read.Directory` | Read directory roles and assignments |
| `SecurityEvents.Read.All` | Read Microsoft Secure Score |

No mail, group, Exchange, Intune, Defender machine/vulnerability, directory-wide profile, or
`ReadWrite` access is requested in Phase 1.

## 3. Azure subscription administrator

Microsoft Graph admin consent does not grant Azure Resource Manager access. Azure subscription
access is optional and is not required for the Phase 1 Graph-only assessment.

When later Azure-resource modules are enabled, a customer subscription administrator assigns
read-only roles manually or through an inspectable, idempotent PowerShell script. Assignments
must be limited to the subscriptions or resource groups selected by the customer.

Candidate roles are:

- `Reader`
- `Log Analytics Reader`
- `Microsoft Sentinel Reader`, only when Sentinel checks are enabled

The script runs in the customer's own Azure session. NSO Audit never receives the
administrator's password, interactive session, access token, or subscription keys.
