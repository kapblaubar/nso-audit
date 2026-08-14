import type { HttpRequest } from "@azure/functions";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const microsoftKeys = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
);

export interface TenantUser {
  tenantId: string;
  objectId: string;
  name?: string;
  username?: string;
}

function getBearerToken(request: HttpRequest): string {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("A bearer access token is required.");
  }

  return authorization.slice("Bearer ".length).trim();
}

function requiredClaim(payload: JWTPayload, name: string): string {
  const value = payload[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`The access token is missing the '${name}' claim.`);
  }
  return value;
}

export async function requireTenantUser(request: HttpRequest): Promise<TenantUser> {
  const clientId = process.env.ENTRA_CLIENT_ID;
  if (!clientId) {
    throw new Error("The API Entra client ID is not configured.");
  }

  const token = getBearerToken(request);
  const { payload } = await jwtVerify(token, microsoftKeys, {
    audience: [clientId, `api://${clientId}`],
  });

  const tenantId = requiredClaim(payload, "tid");
  const objectId = requiredClaim(payload, "oid");
  const expectedIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  if (payload.iss !== expectedIssuer) {
    throw new Error("The access token issuer does not match its tenant.");
  }

  const scopes = typeof payload.scp === "string" ? payload.scp.split(" ") : [];
  if (!scopes.includes("access_as_user")) {
    throw new Error("The access token does not include the required API scope.");
  }

  const name = typeof payload.name === "string" ? payload.name : undefined;
  const username = typeof payload.preferred_username === "string"
    ? payload.preferred_username
    : undefined;

  return {
    tenantId,
    objectId,
    ...(name ? { name } : {}),
    ...(username ? { username } : {}),
  };
}

