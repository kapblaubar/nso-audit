import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import {managementFailure} from '../auth/managementFailure.js';
import { requireManagementUser } from '../auth/requireManagementUser.js';

export async function managementBootstrap(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const user = await requireManagementUser(request);
    return {
      status: 200, headers: { 'Cache-Control': 'no-store' },
      jsonBody: { role: user.role, name: user.name ?? 'NewSommer administrator', environment: process.env.APP_ENVIRONMENT ?? 'unknown' },
    };
  } catch (error) {
    context.warn('Management bootstrap denied or unavailable.');
    return {...managementFailure(error),headers:{'Cache-Control':'no-store'}};
  }
}

app.http('managementBootstrap', { methods: ['GET'], authLevel: 'anonymous', route: 'management/bootstrap', handler: managementBootstrap });
