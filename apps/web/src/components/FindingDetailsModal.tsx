import { useEffect } from "react";

interface FindingDetailsModalProps {
  finding: { checkId: string; title: string; detail: string; evidence?: unknown };
  onClose: () => void;
}

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord | undefined => typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined;
const asRecords = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => Boolean(item)) : [];
const text = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const valueText = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
const list = (value: unknown) => Array.isArray(value) && value.length ? value.map(valueText).join(", ") : "None";
const label = (value: string) => value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

function GlobalAdminDetails({ evidence }: { evidence: JsonRecord }) {
  const administrators = asRecords(evidence.administrators);
  return <><p className="detail-intro">Active assignments to the Global Administrator directory role.</p><div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>Name</th><th>Email / user principal name</th><th>Principal type</th><th>Object ID</th></tr></thead><tbody>{administrators.map((admin) => <tr key={text(admin.id)}><td><strong>{text(admin.displayName, "Name unavailable")}</strong></td><td>{text(admin.email ?? admin.userPrincipalName, "Email unavailable")}</td><td>{text(admin.principalType).replace("#microsoft.graph.", "")}</td><td><code>{text(admin.id)}</code></td></tr>)}</tbody></table></div>{administrators.some((admin) => !admin.displayName) ? <p className="detail-note">Some identities could not be resolved. Grant the listed basic-user permission, renew tenant admin consent, and run a new audit.</p> : null}</>;
}

function ConditionalAccessDetails({ evidence }: { evidence: JsonRecord }) {
  const policies = asRecords(evidence.policies);
  const locations = asRecords(evidence.namedLocations);
  return <div className="detail-sections">
    <section><h3>Policies <span>{policies.length}</span></h3>{policies.map((policy) => {
      const conditions = asRecord(policy.conditions);
      const users = asRecord(conditions?.users);
      const applications = asRecord(conditions?.applications);
      const grant = asRecord(policy.grantControls);
      return <article className="policy-detail" key={text(policy.id)}><header><div><strong>{text(policy.displayName)}</strong><code>{text(policy.id)}</code></div><span className={`policy-state state-${text(policy.state).toLowerCase()}`}>{text(policy.state)}</span></header><dl><div><dt>Users included</dt><dd>{list(users?.includeUsers)}</dd></div><div><dt>Users excluded</dt><dd>{list(users?.excludeUsers)}</dd></div><div><dt>Applications included</dt><dd>{list(applications?.includeApplications)}</dd></div><div><dt>Locations included</dt><dd>{list(asRecord(conditions?.locations)?.includeLocations)}</dd></div><div><dt>Grant controls</dt><dd>{list(grant?.builtInControls)}</dd></div><div><dt>Created</dt><dd>{text(policy.createdDateTime)}</dd></div></dl></article>;
    })}</section>
    <section><h3>Named locations <span>{locations.length}</span></h3><div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>Name</th><th>Type</th><th>Trusted</th><th>Configuration</th></tr></thead><tbody>{locations.map((location) => <tr key={text(location.id)}><td>{text(location.displayName)}</td><td>{text(location["@odata.type"]).replace("#microsoft.graph.", "")}</td><td>{location.isTrusted === true ? "Yes" : "No"}</td><td>{list(location.ipRanges ?? location.countriesAndRegions)}</td></tr>)}</tbody></table></div></section>
  </div>;
}

function IntuneDetails({ evidence }: { evidence: JsonRecord }) {
  const groups = Object.entries(evidence).filter(([, value]) => Array.isArray(value));
  return <div className="detail-sections">{groups.map(([groupName, value]) => <section key={groupName}><h3>{label(groupName)} <span>{asRecords(value).length}</span></h3>{asRecords(value).map((policy) => <article className="policy-detail" key={text(policy.id)}><header><div><strong>{text(policy.displayName)}</strong><code>{text(policy.id)}</code></div><span>{text(policy["@odata.type"]).replace("#microsoft.graph.", "")}</span></header><dl>{Object.entries(policy).filter(([key]) => !["id", "displayName", "@odata.type"].includes(key)).map(([key, item]) => <div key={key}><dt>{label(key)}</dt><dd>{valueText(item)}</dd></div>)}</dl></article>)}</section>)}</div>;
}

export function FindingDetailsModal({ finding, onClose }: FindingDetailsModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = ""; };
  }, [onClose]);
  const evidence = asRecord(finding.evidence) ?? {};
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-title"><header><div><p className="eyebrow">Audit evidence</p><h2 id="evidence-title">{finding.title}</h2><p>{finding.detail}</p></div><button type="button" onClick={onClose} aria-label="Close details">×</button></header><div className="evidence-modal-body">{finding.checkId === "entra.global-admins" ? <GlobalAdminDetails evidence={evidence} /> : finding.checkId === "entra.conditional-access" ? <ConditionalAccessDetails evidence={evidence} /> : finding.checkId.startsWith("intune.") ? <IntuneDetails evidence={evidence} /> : <pre className="fallback-evidence"><code>{JSON.stringify(finding.evidence, null, 2)}</code></pre>}</div></section></div>;
}
