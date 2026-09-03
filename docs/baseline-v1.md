# NSO Foundation Baseline v1

Baseline ID: `nso-foundation-v1`

This first baseline is a preview assessment model, not a certification or a claim of complete
CIS, NIST, or Microsoft compliance. It scores only controls for which the current collectors can
produce direct evidence. Microsoft 365 Secure Score and Defender for Cloud Secure Score remain
independent vendor measurements and are not blended into the NSO score.

## Scored controls

| Control | Weight | Pass rule | Partial rule | Source |
|---|---:|---|---|---|
| MFA registration | 20 | At least 95% of reported users registered | 80–94%; earned points remain proportional to coverage | Graph authentication registration report |
| All-user MFA policy | 20 | Enabled Conditional Access policy includes all users and all resources, requires MFA, and has no detected identity exclusions | Matching broad policy has exclusions requiring review | Graph Conditional Access policies |
| Block legacy authentication | 15 | Enabled policy includes all users and resources, blocks Exchange ActiveSync and other legacy clients | None in v1 | Graph Conditional Access policies |
| Global Administrator count | 15 | 2–5 active assignments | 1 or 6–8 active assignments | Graph directory role assignments |
| Defender high-severity posture | 30 | No retained high- or medium-severity recommendations | No high findings but medium findings remain, or 1–3 high findings remain | Defender for Cloud assessments |

The score is earned weight divided by assessed weight. An unavailable control is `unsupported`
and reduces Assessment Coverage; it does not silently become a pass or a score of zero. Controls
with available evidence are reported as `pass`, `partial`, or `fail`.

## Informational controls

Intune device-policy inventory, Intune app-protection inventory, Microsoft 365 Secure Score, and
Defender for Cloud Secure Score are shown without NSO weight. Inventory presence alone does not
prove assignment coverage or secure configuration, and vendor scores retain their own methods.

## Known limitations and next evidence work

- Resolve Conditional Access group, role, guest, and emergency-access exclusions before claiming
  complete policy coverage.
- Add phishing-resistant MFA for administrators and Azure-management protection as atomic
  controls.
- Collect Intune assignments, licensing, applicability, and managed-device coverage before
  scoring policy presence.
- Follow every Graph and Azure pagination link before treating counts as complete.
- Evaluate Defender findings beyond the retained top 25 and add accepted-risk exceptions.
- Validate the Global Administrator threshold alongside emergency-access coverage and PIM.
- Version every rule or weight change; historical scans retain the baseline ID used at execution.
