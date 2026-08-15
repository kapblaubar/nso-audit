import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { requireTenantUser } from "../auth/requireTenantUser.js";
import { runStarterCollection } from "../access/customerAccess.js";
import { getStarterScan, listTenantScans, saveStarterScan } from "../storage/tenantStore.js";

export async function startScan(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await requireTenantUser(request);
    const body = await request.json() as { subscriptionId?: unknown };
    if (typeof body.subscriptionId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.subscriptionId)) return { status: 400, jsonBody: { error: "A valid Subscription ID is required." } };
    const findings = await runStarterCollection(user.tenantId, body.subscriptionId);
    return { status: 201, jsonBody: await saveStarterScan(user.tenantId, body.subscriptionId, findings) };
  } catch (error) {
    context.error("Starter scan failed", error instanceof Error ? error.message : "Unknown error");
    return { status: 500, jsonBody: { error: "The starter audit could not be completed." } };
  }
}

export async function getScan(request: HttpRequest): Promise<HttpResponseInit> {
  try {
    const user = await requireTenantUser(request);
    const scanId = request.params.scanId;
    if (!scanId) return { status: 400, jsonBody: { error: "Scan ID is required." } };
    const scan = await getStarterScan(user.tenantId, scanId);
    return scan ? { status: 200, jsonBody: scan } : { status: 404, jsonBody: { error: "Scan not found." } };
  } catch { return { status: 401, jsonBody: { error: "Authentication required." } }; }
}

export async function listScans(request: HttpRequest): Promise<HttpResponseInit> {
  try {
    const user = await requireTenantUser(request);
    return { status: 200, jsonBody: { scans: await listTenantScans(user.tenantId) } };
  } catch { return { status: 401, jsonBody: { error: "Authentication required." } }; }
}

app.http("startScan", { methods: ["POST"], authLevel: "anonymous", route: "me/scans", handler: startScan });
app.http("getScan", { methods: ["GET"], authLevel: "anonymous", route: "me/scans/{scanId}", handler: getScan });
app.http("listScans", { methods: ["GET"], authLevel: "anonymous", route: "me/scans", handler: listScans });
