import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { assertSqlCutoverActivated } from '../storage/sqlTenantStore.js';

export async function health(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const storage = process.env.TENANT_STORE ?? 'tables';
  if (storage === 'sql') {
    try { await assertSqlCutoverActivated(); }
    catch (error) {
      const code = typeof error==='object' && error!==null && 'code' in error && typeof error.code==='string'
        && /^[A-Z_]{1,32}$/.test(error.code) ? error.code : 'SQL_UNAVAILABLE';
      const message=error instanceof Error?error.message:'';
      const clientIp=/Client with IP address '([0-9.]+)'/.exec(message)?.[1];
      const reason=clientIp?'firewallDenied':/Login failed for user/i.test(message)?'identityDenied':'connectionUnavailable';
      context.warn('SQL scan storage health check failed.', { code,reason });
      return { status:503, jsonBody:{ service:'nso-audit-api', status:'unhealthy',storage,errorCode:code,reason,
        ...(process.env.APP_ENVIRONMENT==='dev' && clientIp?{clientIp}:{}) },headers:{'Cache-Control':'no-store'} };
    }
  }
  context.log("Health check completed");

  return {
    status: 200,
    jsonBody: {
      service: "nso-audit-api",
      status: "healthy",
      storage,
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

