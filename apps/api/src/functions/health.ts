import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";

export async function health(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  context.log("Health check completed");

  return {
    status: 200,
    jsonBody: {
      service: "nso-audit-api",
      status: "healthy",
      timestamp: new Date().toISOString(),
    },
  };
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});

