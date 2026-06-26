/** DESKTOP ONLY — compatibility re-exports for the unified auth bootstrap flow. */

export {
    assertDesktopRelativeApiPath,
    createDesktopAuthenticatedFetch,
    createDesktopProtectedActionClient,
    DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS,
    hasValidDesktopSupabaseSession,
    resolveDesktopAuthenticatedCredentials,
    SESSION_EXPIRED_MESSAGE,
    type DesktopAuthenticatedCredentials,
    type DesktopAuthenticatedFetch,
    type DesktopAuthenticatedFetchInit,
    type DesktopAuthenticatedRequestConfig,
    type DesktopAuthRequestMode,
    type DesktopAuthTransport,
    type DesktopProtectedActionClientConfig,
    type DesktopProtectedActionFetch,
    type DesktopProtectedActionFetchInit,
} from "./desktop-auth-bootstrap-flow";
