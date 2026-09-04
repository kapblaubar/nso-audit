import assert from "node:assert/strict";
import test from "node:test";
import { evaluateBaseline } from "./baseline.js";

const broadMfaPolicy = {
  state: "enabled",
  conditions: {
    users: { includeUsers: ["All"] },
    applications: { includeApplications: ["All"] },
    clientAppTypes: ["browser", "mobileAppsAndDesktopClients"],
  },
  grantControls: { builtInControls: ["mfa"] },
};

const legacyBlockPolicy = {
  state: "enabled",
  conditions: {
    users: { includeUsers: ["All"] },
    applications: { includeApplications: ["All"] },
    clientAppTypes: ["exchangeActiveSync", "other"],
  },
  grantControls: { builtInControls: ["block"] },
};

test("awards a complete score only when all weighted controls pass", () => {
  const result = evaluateBaseline([
    { checkId: "entra.mfa-registration", detail: "", evidence: { registeredUsers: 100, totalUsers: 100 } },
    { checkId: "entra.conditional-access", detail: "", evidence: { policies: [broadMfaPolicy, legacyBlockPolicy] } },
    { checkId: "entra.global-admins", detail: "", evidence: { administrators: [{}, {}, {}] } },
    { checkId: "defender.recommendations", detail: "", evidence: { recommendations: [] } },
  ]);

  assert.equal(result.baselineId, "nso-foundation-v1");
  assert.equal(result.score, 100);
  assert.equal(result.coverage, 100);
  assert.equal(result.controls.filter((control) => control.weight > 0).every((control) => control.status === "pass"), true);
});

test("scores identity controls while retaining Defender risk as informational", () => {
  const result = evaluateBaseline([
    { checkId: "entra.mfa-registration", detail: "", evidence: { registeredUsers: 8, totalUsers: 10 } },
    { checkId: "entra.conditional-access", detail: "", evidence: { policies: [{ ...broadMfaPolicy, conditions: { ...broadMfaPolicy.conditions, users: { includeUsers: ["All"], excludeUsers: ["redacted"] } } }] } },
    { checkId: "entra.global-admins", detail: "", evidence: { administrators: [{}, {}, {}] } },
    { checkId: "defender.recommendations", detail: "", evidence: { recommendations: Array.from({ length: 4 }, () => ({ severity: "High" })) } },
  ]);

  assert.equal(result.score, 59);
  assert.equal(result.coverage, 100);
  assert.equal(result.controls.find((control) => control.controlId === "identity.mfa-registration")?.status, "partial");
  assert.equal(result.controls.find((control) => control.controlId === "identity.ca-block-legacy-auth")?.status, "fail");
  assert.equal(result.controls.find((control) => control.controlId === "azure.defender-high-severity")?.status, "informational");
  assert.equal(result.controls.find((control) => control.controlId === "azure.defender-high-severity")?.weight, 0);
});

test("reports missing evidence as reduced coverage rather than a zero score", () => {
  const result = evaluateBaseline([]);
  assert.equal(result.score, null);
  assert.equal(result.coverage, 0);
  assert.equal(result.controls.filter((control) => control.weight > 0).every((control) => control.status === "unsupported"), true);
});
