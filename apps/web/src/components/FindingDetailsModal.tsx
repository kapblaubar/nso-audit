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

const allowedRichTags = new Set(["A", "B", "BR", "CODE", "EM", "I", "LI", "OL", "P", "SPAN", "STRONG", "UL"]);

function sanitizedRichHtml(value: string): string {
  const document = new DOMParser().parseFromString(value, "text/html");
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    if (!allowedRichTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    const href = element.tagName === "A" ? element.getAttribute("href") ?? "" : "";
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    if (element.tagName === "A" && href.startsWith("https://")) {
      element.setAttribute("href", href);
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer");
    } else if (element.tagName === "A") {
      element.replaceWith(...Array.from(element.childNodes));
    }
  }
  return document.body.innerHTML;
}

function SafeRichText({ value }: { value: unknown }) {
  if (typeof value !== "string" || !value.trim()) return <>Microsoft did not return remediation text for this item.</>;
  return <div className="safe-rich-text" dangerouslySetInnerHTML={{ __html: sanitizedRichHtml(value) }} />;
}

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

function RecommendationDetails({ evidence, defender = false }: { evidence: JsonRecord; defender?: boolean }) {
  const recommendations = asRecords(evidence.recommendations);
  return <div className="recommendation-list">{recommendations.length ? recommendations.map((recommendation, index) => <article key={text(recommendation.id, String(index))}><header><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{text(recommendation.title)}</h3><p>{defender ? `${text(recommendation.severity, "Unknown")} severity · ${text(recommendation.affectedResourceCount, "0")} affected resource${recommendation.affectedResourceCount === 1 ? "" : "s"}` : `${text(recommendation.potentialGain, "0")} potential points · ${text(recommendation.scorePercentage, "0")}% complete`}</p></div></header><dl>{defender ? <><div><dt>Assessment state</dt><dd>{text(recommendation.status)}</dd></div><div><dt>Reported causes</dt><dd>{list(recommendation.causes)}</dd></div><div className="recommendation-remediation"><dt>Affected resources</dt><dd><ul className="resource-list">{Array.isArray(recommendation.affectedResources) ? recommendation.affectedResources.map((resource) => <li key={String(resource)}><code>{String(resource)}</code></li>) : null}</ul>{Number(recommendation.affectedResourceCount ?? 0) > 10 ? <small>Showing 10 of {String(recommendation.affectedResourceCount)} resources.</small> : null}</dd></div></> : <><div><dt>Service</dt><dd>{text(recommendation.service)}</dd></div><div><dt>Implementation cost</dt><dd>{text(recommendation.implementationCost)}</dd></div><div><dt>User impact</dt><dd>{text(recommendation.userImpact)}</dd></div><div><dt>Threats addressed</dt><dd>{list(recommendation.threats)}</dd></div></>}<div className="recommendation-remediation"><dt>Recommended action</dt><dd><SafeRichText value={recommendation.remediation ?? recommendation.description} /></dd></div></dl>{typeof recommendation.actionUrl === "string" && recommendation.actionUrl.startsWith("https://") ? <a href={recommendation.actionUrl} target="_blank" rel="noreferrer">Open Microsoft action page</a> : null}</article>) : <div className="empty-detail"><strong>No outstanding recommendations</strong><p>The source did not return an incomplete recommendation for this area.</p></div>}</div>;
}

export function FindingDetailsModal({ finding, onClose }: FindingDetailsModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.style.overflow = ""; };
  }, [onClose]);
  const evidence = asRecord(finding.evidence) ?? {};
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="evidence-title"><header><div><p className="eyebrow">Audit evidence</p><h2 id="evidence-title">{finding.title}</h2><p>{finding.detail}</p></div><button type="button" onClick={onClose} aria-label="Close details">×</button></header><div className="evidence-modal-body">{finding.checkId === "entra.global-admins" ? <GlobalAdminDetails evidence={evidence} /> : finding.checkId === "entra.conditional-access" ? <ConditionalAccessDetails evidence={evidence} /> : finding.checkId.startsWith("intune.") ? <IntuneDetails evidence={evidence} /> : finding.checkId.startsWith("m365.recommendations.") ? <RecommendationDetails evidence={evidence} /> : finding.checkId === "defender.recommendations" ? <RecommendationDetails evidence={evidence} defender /> : <pre className="fallback-evidence"><code>{JSON.stringify(finding.evidence, null, 2)}</code></pre>}</div></section></div>;
}
