# Restore tenant audit launch: November 9, 2026

The preceding navigation changes incorrectly made a license-only, disabled collection screen
the default workspace without preserving a visible action for the existing tenant audit.
This was a scope error: licenses are one dataset within the tenant audit, not its replacement.

The workspace audit page now provides a primary **Run audit** action using the existing
`POST /api/me/scans` collector and report flow. It retrieves the subscription from the newest
non-licensing scan when available and allows an explicit subscription to be entered. Existing
viewer restrictions remain in place. The disabled license-only action is no longer the main
page's launcher. Dedicated historical licensing snapshots retain their evidence viewer and
link back to the tenant audit launcher.

This restores the currently working collector for identity/Conditional Access/MFA, Intune,
Microsoft Secure Score, Azure inventory and Defender for Cloud scores/recommendations.
It does not claim all fifteen example-report sections or licensing are collected together.
Those coverage gaps are visible on the page. Licensing permissions and activation settings
were not changed. No customer data or schema changes are required for this UI correction.

Explicit onboarding opens connection setup; historical report links remain accessible.
The audit launcher is usable even if the separate DATA_AUDITS_ENABLED licensing flag is false.

Validation includes a production web build and the browser test with synthetic intercepted
API responses: restoring subscription settings, primary Run audit calling the existing scan
endpoint, opening the returned report, workspace selection and sign-out/sign-in, as well as
the existing licensing evidence checks. Published to `nso-audit-dev-web` using the versioned
Dev web publishing script and `config/environments/dev.public.json`. Repeated browser checks
against the deployed frontend passed. API calls were intercepted using synthetic responses;
this does not itself prove live source collection or expand supported coverage.
