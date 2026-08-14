export interface PublicAppConfig {
  entraClientId: string;
  authRedirectUri?: string;
  apiBaseUrl?: string;
  apiScope?: string;
}

const authRedirectUri = import.meta.env.VITE_AUTH_REDIRECT_URI?.trim();
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "");
const apiScope = import.meta.env.VITE_API_SCOPE?.trim();

export const appConfig: PublicAppConfig = {
  entraClientId: import.meta.env.VITE_ENTRA_CLIENT_ID?.trim() ?? "",
  ...(authRedirectUri ? { authRedirectUri } : {}),
  ...(apiBaseUrl ? { apiBaseUrl } : {}),
  ...(apiScope ? { apiScope } : {}),
};
