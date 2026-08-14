import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { requireTenantUser } from "../auth/requireTenantUser.js";
import { getTenantBootstrap } from "../storage/tenantStore.js";

function unauthorized(message: string): HttpResponseInit {
  return {
    status: 401,
    jsonBody: { error: "unauthorized", message },
    headers: { "Cache-Control": "no-store" },
  };
}

export async function bootstrap(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let user;
  try {
    user = await requireTenantUser(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    context.warn("Tenant bootstrap authentication rejected", { message });
    return unauthorized("The NSO Audit access token is missing, invalid, or expired.");
  }

  try {
    const response = await getTenantBootstrap(user.tenantId);

    context.log("Tenant bootstrap completed", {
      tenantId: user.tenantId,
      registered: response.registered,
      destination: response.destination,
    });

    return {
      status: 200,
      jsonBody: response,
      headers: { "Cache-Control": "no-store" },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bootstrap error.";
    context.error("Tenant bootstrap failed", { tenantId: user.tenantId, message });
    return {
      status: 500,
      jsonBody: { error: "bootstrap_failed", message: "Tenant setup could not be loaded." },
      headers: { "Cache-Control": "no-store" },
    };
  }
}

app.http("bootstrap", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "me/bootstrap",
  handler: bootstrap,
});
