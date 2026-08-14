import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from "@azure/msal-browser";
import { appConfig } from "./config";

const signInScopes = ["openid", "profile", "email", ...(appConfig.apiScope ? [appConfig.apiScope] : [])];

let client: PublicClientApplication | undefined;

function getClient(): PublicClientApplication {
  if (!appConfig.entraClientId) {
    throw new Error("The Entra client ID is not configured.");
  }

  if (!client) {
    client = new PublicClientApplication({
      auth: {
        clientId: appConfig.entraClientId,
        authority: "https://login.microsoftonline.com/organizations",
        ...(appConfig.authRedirectUri ? { redirectUri: appConfig.authRedirectUri } : {}),
        navigateToLoginRequestUrl: true,
      },
      cache: {
        cacheLocation: "sessionStorage",
      },
      system: {
        allowPlatformBroker: false,
      },
    });
  }

  return client;
}

export interface AuthState {
  account?: AccountInfo;
  error?: string;
}

export async function initializeAuth(): Promise<AuthState> {
  try {
    const authClient = getClient();
    await authClient.initialize();
    const result: AuthenticationResult | null = await authClient.handleRedirectPromise();
    const account = result?.account ?? authClient.getActiveAccount() ?? authClient.getAllAccounts()[0];

    if (account) {
      authClient.setActiveAccount(account);
      return { account };
    }

    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Microsoft sign-in failed." };
  }
}

export async function signIn(): Promise<void> {
  const authClient = getClient();
  await authClient.loginRedirect({
    scopes: signInScopes,
    prompt: "select_account",
  });
}

export async function getApiAccessToken(account: AccountInfo): Promise<string> {
  if (!appConfig.apiScope) {
    throw new Error("The NSO Audit API scope is not configured.");
  }

  const authClient = getClient();
  try {
    const result = await authClient.acquireTokenSilent({
      account,
      scopes: [appConfig.apiScope],
    });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await authClient.acquireTokenRedirect({
        account,
        scopes: [appConfig.apiScope],
      });
    }
    throw error;
  }
}

export async function signOut(): Promise<void> {
  const authClient = getClient();
  const account = authClient.getActiveAccount();
  await authClient.logoutRedirect({
    ...(account ? { account } : {}),
    postLogoutRedirectUri: window.location.origin,
  });
}
