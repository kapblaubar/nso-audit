export interface PublicAppConfig {
  entraClientId: string;
  authRedirectUri?: string;
}

const authRedirectUri = import.meta.env.VITE_AUTH_REDIRECT_URI?.trim();

export const appConfig: PublicAppConfig = {
  entraClientId: import.meta.env.VITE_ENTRA_CLIENT_ID?.trim() ?? "",
  ...(authRedirectUri ? { authRedirectUri } : {}),
};

