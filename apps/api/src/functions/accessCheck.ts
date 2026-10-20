import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { requireAuditUser, AuditAccessError } from "../auth/requireAuditUser.js";
import { checkCustomerAccess } from "../access/customerAccess.js";
import { saveAccessCheck } from "../storage/tenantStore.js";

export async function accessCheck(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await requireAuditUser(request);
    const body = await request.json() as { subscriptionId?: unknown };
    if (typeof body.subscriptionId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.subscriptionId)) {
      return { status: 400, jsonBody: { error: "A valid Azure Subscription ID is required." } };
    }
    const result = await checkCustomerAccess(user.tenantId, body.subscriptionId);
    await saveAccessCheck(user.tenantId, body.subscriptionId, result.tenantAccess.ok, result.resourceReader.ok && result.securityReader.ok);
    return { status: 200, jsonBody: result };
  } catch (error) {
    if(error instanceof AuditAccessError)return{status:error.status,jsonBody:{error:error.message}};
    context.error("Access verification failed", error instanceof Error ? error.message : "Unknown error");
    return { status: 500, jsonBody: { error: "Access could not be verified. Confirm workload identity configuration and try again." } };
  }
}

app.http("accessCheck", { methods: ["POST"], authLevel: "anonymous", route: "me/access-check", handler: accessCheck });
