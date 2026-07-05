/** DESKTOP ONLY — compatibility re-exports for the protected API pipeline. */

export {
    assertDesktopRelativeApiPath,
    createDesktopAuthenticatedFetch,
    createDesktopProtectedActionClient,
    createDesktopProtectedApiFetch,
    DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS,
    DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE,
    hasValidDesktopSupabaseSession,
    resolveDesktopAuthenticatedCredentials,
    resolveDesktopProtectedApiCredentials,
    type DesktopAuthenticatedCredentials,
    type DesktopAuthenticatedFetch,
    type DesktopAuthenticatedFetchInit,
    type DesktopAuthenticatedRequestConfig,
    type DesktopAuthTransport,
    type DesktopProtectedActionClientConfig,
    type DesktopProtectedActionFetch,
    type DesktopProtectedActionFetchInit,
} from "./desktop-protected-action-pipeline";

export { SESSION_EXPIRED_MESSAGE } from "./desktop-auth-recovery-gate";
