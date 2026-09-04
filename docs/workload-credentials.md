# Workload credential bootstrap

NSO Audit uses deployment-owned credentials for its multitenant App Registration. Customer
tenants grant consent to that application but never create, receive, paste, or store its
credentials.

## Credentials

Each independent MSP deployment has at most one active credential set:

| Credential | Purpose | Storage | Entra registration |
|---|---|---|---|
| Client secret | Current Microsoft Graph client-credential flow | Key Vault secret `nso-audit-app-client-secret` | Password credential on the App Registration |
| Client certificate | Future Security & Compliance PowerShell connection for Purview DLP | Key Vault certificate and its protected PFX backing secret | Public certificate only on the App Registration |

The Function's managed identity retrieves credentials at runtime. A credential value, PFX,
private key, or password must never be stored in Function settings, source control, a deployment
output, shell history, or a customer tenant.

## Preferred automated flow

The environment bootstrap must run an idempotent credential step after the App Registration and
Key Vault exist:

1. Resolve the App Registration by object/application ID and the vault by Azure resource ID.
2. Inspect Entra credential metadata and Key Vault metadata using fixed deployment-specific
   display names. Compare credential identifiers and expiry dates without reading secret values.
3. If the client secret is absent from both systems, create an App Registration password
   credential, capture its value once in process memory, write it directly to Key Vault, clear
   the variable, and emit only the credential ID and expiry date.
4. If the DLP module is selected and its certificate is absent, ask Key Vault to create a
   self-signed RSA certificate using an approved policy. Register only the public certificate
   with the App Registration. The private key remains in Key Vault and is retrieved into Function
   process memory only for a DLP scan.
5. Configure only Key Vault URI and credential **names** on the Function App.
6. Verify that the Function managed identity can read the required Key Vault secret objects and
   that a tenant-specific token can be acquired. Do not reveal either credential during the test.

The step must stop on a split state—for example, a Key Vault secret without a matching active
Entra credential—rather than silently replacing it. Recovery offers an explicit rotate or repair
operation so an operator can review the affected credential.

Certificate policy requirements:

- RSA 2048 bits or stronger and SHA-256;
- client-authentication use;
- descriptive subject and fixed credential display name;
- exportable only because Security & Compliance PowerShell requires an in-process certificate
  with its private key; access remains limited by Key Vault RBAC;
- defined lifetime, expiry monitoring, and overlapping renewal window;
- public certificate registered on the App Registration with the same expiry.

## Operator-supplied fallback

Some MSPs require credentials issued by an internal PKI or created by a separate identity team.
The bootstrap therefore supports an explicit import mode:

- Secret values are accepted through a secure, non-echoing prompt and written directly to Key
  Vault. A command-line secret parameter is prohibited because it can enter shell history or
  process listings.
- Certificates are imported from a local PFX through a secure password prompt. The bootstrap
  uploads the PFX to Key Vault and the public certificate to Entra, then tells the operator to
  remove the local PFX according to their organization's handling policy.
- Copying a base64 PFX or private key into a browser or ordinary text box is not supported.

The setup summary displays only `Present`, `Missing`, `Expiring`, `Mismatched`, or `Not required`,
along with safe identifiers and dates. It provides `Create`, `Import`, `Rotate`, and `Repair`
actions according to the operator's authorization.

## Rotation and recovery

- Create the replacement credential before removing the current one.
- Store a new Key Vault version and validate token acquisition before changing the active
  version reference.
- Keep the old credential for a short documented overlap window, then revoke it from Entra.
- Alert before expiry and record credential ID, actor, time, and outcome without credential data.
- Emergency revocation removes the Entra credential first, disables its Key Vault version, and
  requires a new end-to-end token test.

Credential creation is a hosting-environment operation. It is never part of customer onboarding.
