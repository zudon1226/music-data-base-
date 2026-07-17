#!/usr/bin/env node
/**
 * Desktop regression lock — static verification (no browser, no app behavior changes).
 * Run: npm run verify:desktop
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const failures = [];
const warnings = [];
const passed = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function pass(message) {
  passed.push(message);
}

function read(path) {
  const full = join(ROOT, path);
  if (!existsSync(full)) {
    fail(`Missing required file: ${path}`);
    return "";
  }
  return readFileSync(full, "utf8");
}

function assertIncludes(content, needle, context) {
  if (!content.includes(needle)) {
    fail(`${context}: expected to find \`${needle}\``);
    return false;
  }
  pass(`${context}: contains \`${needle}\``);
  return true;
}

function assertNotIncludes(content, needle, context) {
  if (content.includes(needle)) {
    fail(`${context}: must not contain \`${needle}\` (regression risk)`);
    return false;
  }
  pass(`${context}: excludes \`${needle}\``);
  return true;
}

function assertExport(content, exportName, file) {
  const patterns = [
    `export async function ${exportName}`,
    `export function ${exportName}`,
    `export const ${exportName}`,
    `export type ${exportName}`,
    `export { ${exportName}`,
    `export {\n    ${exportName}`,
    `${exportName},`,
  ];
  if (!patterns.some((p) => content.includes(p))) {
    fail(`${file}: missing export \`${exportName}\``);
    return false;
  }
  pass(`${file}: exports \`${exportName}\``);
  return true;
}

console.log("Desktop regression lock — static verification\n");

// --- Required desktop module files ---
assertIncludes(read("components/desktop-content-scroll-root.tsx"), "data-main-scroll-container", "desktop-content-scroll-root marks main scroll container");

const REQUIRED_DESKTOP_MODULES = [
  "lib/desktop-protected-action-pipeline.ts",
  "lib/desktop-protected-click-dispatch.ts",
  "lib/desktop-production-protected-runtime.ts",
  "lib/desktop-protected-interaction-layer.ts",
  "lib/desktop-protected-api-pipeline.ts",
  "lib/desktop-authenticated-request-pipeline.ts",
  "lib/desktop-protected-action-auth-guard.ts",
  "lib/desktop-protected-action-client.ts",
  "lib/desktop-action-runtime.ts",
  "lib/desktop-app-navigation.ts",
  "lib/desktop-app-bootstrap.ts",
  "lib/desktop-user-music-state-bootstrap.ts",
  "lib/desktop-auth-state.tsx",
  "lib/desktop-auth-recovery-gate.ts",
  "lib/desktop-content-scroll.ts",
  "lib/navigation-scroll.ts",
  "components/desktop-content-scroll-root.tsx",
  "components/desktop-app-sidebar-nav.tsx",
  "lib/desktop-video-upload-runner.ts",
  "lib/desktop-video-upload-transaction.ts",
  "lib/desktop-video-upload-lifecycle.ts",
  "lib/desktop-video-upload-progress.ts",
  "lib/desktop-video-upload-transfer.ts",
  "lib/desktop-video-upload-completion.ts",
  "lib/desktop-upload-auth-session-guard.ts",
  "docs/desktop-regression-lock.md",
];

for (const mod of REQUIRED_DESKTOP_MODULES) {
  if (!existsSync(join(ROOT, mod))) {
    fail(`Missing required file: ${mod}`);
  } else {
    pass(`exists ${mod}`);
  }
}

// --- Module export contracts ---
const guard = read("lib/desktop-protected-action-auth-guard.ts");
assertExport(guard, "createDesktopProtectedActionAuthGuard", "desktop-protected-action-auth-guard.ts");
assertExport(guard, "evaluateDesktopProtectedActionAuth", "desktop-protected-action-auth-guard.ts");
assertExport(guard, "hasDesktopProtectedActionAccess", "desktop-protected-action-auth-guard.ts");
assertIncludes(guard, "requireLiveUserId", "desktop-protected-action-auth-guard.ts live write guard");
assertIncludes(guard, "resolveLiveDesktopProtectedActionCredentials", "desktop-protected-action-auth-guard.ts live session source");

const clickDispatch = read("lib/desktop-protected-click-dispatch.ts");
assertExport(clickDispatch, "dispatchDesktopSongLike", "desktop-protected-click-dispatch.ts");
assertExport(clickDispatch, "dispatchDesktopArtistFollow", "desktop-protected-click-dispatch.ts");
assertExport(clickDispatch, "dispatchDesktopLibrarySave", "desktop-protected-click-dispatch.ts");
assertExport(clickDispatch, "dispatchDesktopCreatePlaylist", "desktop-protected-click-dispatch.ts");
assertExport(clickDispatch, "registerDesktopProductionSessionPublisher", "desktop-protected-click-dispatch.ts");
assertIncludes(clickDispatch, "executeDesktopProtectedRequest", "desktop-protected-click-dispatch.ts uses shared pipeline");
assertIncludes(clickDispatch, "desktop-protected-action-pipeline", "desktop-protected-click-dispatch.ts shared pipeline import");
assertIncludes(clickDispatch, "[desktop-protected-click-dispatch]", "desktop-protected-click-dispatch.ts logging");
assertIncludes(clickDispatch, 'method: "POST"', "desktop-protected-click-dispatch.ts always POST");
assertIncludes(clickDispatch, "injectAuthenticatedUserId", "desktop-protected-click-dispatch.ts injects user id");
assertIncludes(clickDispatch, "guardDesktopProtectedAction", "desktop-protected-click-dispatch.ts blocks without global session");
assertIncludes(clickDispatch, "desktop-protected-action-gate", "desktop-protected-click-dispatch.ts action gate import");

const actionGate = read("lib/desktop-protected-action-gate.ts");
assertExport(actionGate, "isDesktopProtectedActionsEnabled", "desktop-protected-action-gate.ts");
assertExport(actionGate, "guardDesktopProtectedAction", "desktop-protected-action-gate.ts");
assertExport(actionGate, "createBlockedProtectedResponse", "desktop-protected-action-gate.ts");
assertExport(actionGate, "subscribeDesktopProtectedActionsReady", "desktop-protected-action-gate.ts");

const productionRuntime = read("lib/desktop-production-protected-runtime.ts");
assertIncludes(productionRuntime, "desktop-protected-click-dispatch", "desktop-production-protected-runtime.ts re-exports click dispatch");

const interactionLayer = read("lib/desktop-protected-interaction-layer.ts");
assertExport(interactionLayer, "createDesktopProtectedInteractionLayer", "desktop-protected-interaction-layer.ts");
assertIncludes(interactionLayer, "postSongLike", "desktop-protected-interaction-layer.ts postSongLike method");
assertIncludes(interactionLayer, '"/api/song-likes"', "desktop-protected-interaction-layer.ts song-like endpoint");
assertIncludes(interactionLayer, '"/api/artist-follow"', "desktop-protected-interaction-layer.ts artist-follow endpoint");
assertIncludes(interactionLayer, '"/api/library/save"', "desktop-protected-interaction-layer.ts library-save endpoint");
assertIncludes(interactionLayer, '"/api/playlists"', "desktop-protected-interaction-layer.ts playlist endpoint");
assertIncludes(interactionLayer, "injectAuthenticatedUserId", "desktop-protected-interaction-layer.ts auto user id");
assertIncludes(interactionLayer, "[desktop-interaction]", "desktop-protected-interaction-layer.ts dispatch logging");

const actionPipeline = read("lib/desktop-protected-action-pipeline.ts");
assertExport(actionPipeline, "createDesktopProtectedActionFetch", "desktop-protected-action-pipeline.ts");
assertExport(actionPipeline, "resolveLiveDesktopProtectedActionCredentials", "desktop-protected-action-pipeline.ts");
assertExport(actionPipeline, "createDesktopProtectedActionPipeline", "desktop-protected-action-pipeline.ts");
assertExport(actionPipeline, "acquireFreshDesktopProtectedCredentials", "desktop-protected-action-pipeline.ts");
assertExport(actionPipeline, "executeDesktopProtectedRequest", "desktop-protected-action-pipeline.ts");
assertIncludes(actionPipeline, "DESKTOP_PROTECTED_ENDPOINTS", "desktop-protected-action-pipeline.ts protected endpoints");
assertIncludes(actionPipeline, '[desktop-protected-request]', "desktop-protected-action-pipeline.ts logging prefix");
assertIncludes(actionPipeline, 'headers.set("Authorization"', "desktop-protected-action-pipeline.ts bearer header");
assertIncludes(actionPipeline, 'headers.set("apikey"', "desktop-protected-action-pipeline.ts apikey header");
assertIncludes(actionPipeline, 'redirect: "error"', "desktop-protected-action-pipeline.ts blocks SSO redirects");
assertIncludes(actionPipeline, 'credentials: "same-origin"', "desktop-protected-action-pipeline.ts sends deployment cookies");
assertIncludes(actionPipeline, "isDesktopApiReady", "desktop-protected-action-pipeline.ts api ready gate");
assertIncludes(actionPipeline, "isDesktopAuthenticatedSessionReady", "desktop-protected-action-pipeline.ts session ready alias");
assertIncludes(actionPipeline, "auth-bootstrap-not-ready", "desktop-protected-action-pipeline.ts blocks before bootstrap ready");
assertIncludes(actionPipeline, "global-session", "desktop-protected-action-pipeline.ts global session logging");
assertNotIncludes(actionPipeline, "supabase.auth.getSession", "desktop-protected-action-pipeline.ts must not read getSession per request");
assertIncludes(actionPipeline, "supabase.auth.refreshSession", "desktop-protected-action-pipeline.ts refresh before dispatch");
assertIncludes(actionPipeline, "buildFreshProtectedApiHeaders", "desktop-protected-action-pipeline.ts fresh headers per request");
assertIncludes(actionPipeline, "request-dispatched", "desktop-protected-action-pipeline.ts dispatch debug logging");
assertIncludes(actionPipeline, "sessionExists", "desktop-protected-action-pipeline.ts session debug logging");
assertIncludes(actionPipeline, "accessTokenPresent", "desktop-protected-action-pipeline.ts token debug logging");
assertIncludes(actionPipeline, "authorizationAdded", "desktop-protected-action-pipeline.ts authorization debug logging");
assertIncludes(actionPipeline, "injectAuthenticatedUserId", "desktop-protected-action-pipeline.ts body user id injection");
assertIncludes(actionPipeline, "abort-no-session", "desktop-protected-action-pipeline.ts aborts without bearer");
assertIncludes(actionPipeline, "guardDesktopProtectedAction", "desktop-protected-action-pipeline.ts action gate before dispatch");
assertIncludes(actionPipeline, "desktop-protected-action-gate", "desktop-protected-action-pipeline.ts action gate import");

assertNotIncludes(actionPipeline, "mergeDesktopAuthSessionSources", "desktop-protected-action-pipeline.ts must not merge stale sessions");
assertNotIncludes(actionPipeline, "readStoredAuthSession", "desktop-protected-action-pipeline.ts must not read storage cache");
assertNotIncludes(actionPipeline, "readAuthSession?.()", "desktop-protected-action-pipeline.ts must not use React session cache for bearer");

const protectedApiPipeline = read("lib/desktop-protected-api-pipeline.ts");
assertIncludes(protectedApiPipeline, "desktop-protected-action-pipeline", "desktop-protected-api-pipeline.ts re-exports action pipeline");

const runtime = read("lib/desktop-action-runtime.ts");
assertExport(runtime, "createDesktopActionRuntime", "desktop-action-runtime.ts");
assertExport(runtime, "mergeDesktopAuthSessionSources", "desktop-action-runtime.ts");
assertExport(runtime, "resolveDesktopActionUserId", "desktop-action-runtime.ts");
assertExport(runtime, "hasUsableDesktopProtectedActionSession", "desktop-action-runtime.ts");
assertExport(runtime, "resolveDesktopProfileDisplayName", "desktop-action-runtime.ts");
assertExport(runtime, "canDeleteDesktopUploadedItem", "desktop-action-runtime.ts");
assertIncludes(runtime, "desktop-protected-action-pipeline", "desktop-action-runtime.ts uses action pipeline");

const pipeline = read("lib/desktop-authenticated-request-pipeline.ts");
assertExport(pipeline, "createDesktopAuthenticatedFetch", "desktop-authenticated-request-pipeline.ts");
assertExport(pipeline, "resolveDesktopAuthenticatedCredentials", "desktop-authenticated-request-pipeline.ts");

const authBootstrapFlow = read("lib/desktop-auth-bootstrap-flow.ts");
assertIncludes(authBootstrapFlow, "runDesktopRemoteBootstrap", "desktop-auth-bootstrap-flow.ts remote bootstrap");
assertIncludes(authBootstrapFlow, "ensureDesktopAuthenticatedSession", "desktop-auth-bootstrap-flow.ts session restore");
assertIncludes(authBootstrapFlow, "runDesktopAuthBootstrap", "desktop-auth-bootstrap-flow.ts single auth bootstrap");
assertIncludes(authBootstrapFlow, "startDesktopAuthSessionBootstrap", "desktop-auth-bootstrap-flow.ts auth init gate");
assertIncludes(authBootstrapFlow, "markDesktopAuthSignInPending", "desktop-auth-bootstrap-flow.ts sign-in gate");
assertIncludes(authBootstrapFlow, "DESKTOP_AUTH_RATE_LIMIT_MESSAGE", "desktop-auth-bootstrap-flow.ts rate limit message");
assertIncludes(authBootstrapFlow, "initializeDesktopAuthenticatedSession", "desktop-auth-bootstrap-flow.ts unified auth init");
assertIncludes(authBootstrapFlow, "dual-auth-no-bearer", "desktop-auth-bootstrap-flow.ts rejects missing bearer");
assertNotIncludes(authBootstrapFlow, "dual-auth-incomplete", "desktop-auth-bootstrap-flow.ts must not block on missed auth events");
assertIncludes(authBootstrapFlow, "restore-setSession-once", "desktop-auth-bootstrap-flow.ts single restore pass");
assertNotIncludes(authBootstrapFlow, "setTimeout(resolve, 120)", "desktop-auth-bootstrap-flow.ts must not poll refreshSession");
assertIncludes(authBootstrapFlow, "supabase.auth.setSession", "desktop-auth-bootstrap-flow.ts seeds GoTrue client");
assertIncludes(authBootstrapFlow, "supabase.auth.getSession", "desktop-auth-bootstrap-flow.ts verifies live session");
assertNotIncludes(authBootstrapFlow, "refreshSupabaseSession", "desktop-auth-bootstrap-flow.ts must not refresh tokens");
assertIncludes(authBootstrapFlow, "waitForDualAuthConfirmation", "desktop-auth-bootstrap-flow.ts dual auth wait");
assertIncludes(authBootstrapFlow, "onAuthStateChange", "desktop-auth-bootstrap-flow.ts waits for auth state change");
assertIncludes(authBootstrapFlow, "getSession", "desktop-auth-bootstrap-flow.ts waits for getSession");
assertIncludes(authBootstrapFlow, "publishDesktopApiCredentials", "desktop-auth-bootstrap-flow.ts publishes global API credentials");
assertIncludes(authBootstrapFlow, "AUTH BOOTSTRAP START", "desktop-auth-bootstrap-flow.ts bootstrap start log");
assertIncludes(authBootstrapFlow, "SESSION FOUND", "desktop-auth-bootstrap-flow.ts session found log");
assertIncludes(authBootstrapFlow, "APP SHELL OPEN", "desktop-auth-bootstrap-flow.ts shell open log");
assertIncludes(authBootstrapFlow, "requiresLoggedInApiCredentials", "desktop-auth-bootstrap-flow.ts logged-in shell gate");
assertIncludes(authBootstrapFlow, "authSessionInitialized === false", "desktop-auth-bootstrap-flow.ts waits for bootstrap finalize");
assertIncludes(authBootstrapFlow, "isDesktopApiReady", "desktop-auth-bootstrap-flow.ts API ready gate");
assertNotIncludes(authBootstrapFlow, "watchdogForcedShell", "desktop-auth-bootstrap-flow.ts must not force shell via watchdog");
assertNotIncludes(authBootstrapFlow, "publishDesktopAuthenticatedSessionAfterSignIn", "desktop-auth-bootstrap-flow.ts must not bypass bootstrap on sign-in");
assertNotIncludes(authBootstrapFlow, "AUTH_DUAL_WAIT_MS", "desktop-auth-bootstrap-flow.ts must not block on auth event timeout");
assertIncludes(authBootstrapFlow, "resolveBootstrapSession", "desktop-auth-bootstrap-flow.ts linear session resolve");
assertIncludes(authBootstrapFlow, "refreshSession-once", "desktop-auth-bootstrap-flow.ts single refreshSession");
assertIncludes(authBootstrapFlow, "bootstrapRuntime.refreshSessionCalled", "desktop-auth-bootstrap-flow.ts refresh once gate");
assertIncludes(authBootstrapFlow, 'phase === "rate_limited"', "desktop-auth-bootstrap-flow.ts rate-limit stop");
assertIncludes(authBootstrapFlow, "listenerAttached", "desktop-auth-bootstrap-flow.ts single auth listener");
assertNotIncludes(authBootstrapFlow, "bootstrapRuntime.settled = false;\n    bootstrapRuntime.setSessionAttempted = false;\n    bootstrapRuntime.refreshAttempted = false;", "desktop-auth-bootstrap-flow.ts must not reset refresh gates on re-entry");

const authenticatedSession = read("lib/desktop-authenticated-session.ts");
assertExport(authenticatedSession, "publishDesktopApiCredentials", "desktop-authenticated-session.ts");
assertExport(authenticatedSession, "publishDesktopAuthenticatedSession", "desktop-authenticated-session.ts");
assertExport(authenticatedSession, "getDesktopAuthenticatedSession", "desktop-authenticated-session.ts");
assertExport(authenticatedSession, "getDesktopAuthenticatedRefreshToken", "desktop-authenticated-session.ts");
assertExport(authenticatedSession, "isDesktopApiReady", "desktop-authenticated-session.ts");
assertExport(authenticatedSession, "isDesktopAuthenticatedSessionReady", "desktop-authenticated-session.ts");
assertExport(authenticatedSession, "requireDesktopAuthenticatedAccessToken", "desktop-authenticated-session.ts");
assertIncludes(authenticatedSession, "TOKEN READY FAILED: missing access token", "desktop-authenticated-session.ts token failure log");
assertIncludes(authenticatedSession, "TOKEN READY FAILED: missing refresh token", "desktop-authenticated-session.ts refresh failure log");
assertIncludes(authenticatedSession, "TOKEN READY FAILED: missing user id", "desktop-authenticated-session.ts user id failure log");
assertIncludes(authenticatedSession, "TOKEN READY FAILED: expired session", "desktop-authenticated-session.ts expired failure log");
assertIncludes(authenticatedSession, "TOKEN READY FAILED: unknown error", "desktop-authenticated-session.ts unknown failure log");

const client = read("lib/desktop-protected-action-client.ts");
assertExport(client, "createDesktopProtectedActionClient", "desktop-protected-action-client.ts");
assertIncludes(client, "desktop-protected-action-pipeline", "desktop-protected-action-client.ts re-exports pipeline");

const nav = read("lib/desktop-app-navigation.ts");
assertExport(nav, "evaluateDesktopNavAccess", "desktop-app-navigation.ts");
assertExport(nav, "hasDesktopAccountAccess", "desktop-app-navigation.ts");
assertExport(nav, "createDesktopNavHandler", "desktop-app-navigation.ts");

const bootstrap = read("lib/desktop-app-bootstrap.ts");
assertExport(bootstrap, "canRenderDesktopApplicationShell", "desktop-app-bootstrap.ts");

// --- Video upload pipeline ---
const uploadRunner = read("lib/desktop-video-upload-runner.ts");
assertExport(uploadRunner, "runDesktopVideoUpload", "desktop-video-upload-runner.ts");
assertIncludes(uploadRunner, "beginDesktopVideoUploadTransaction", "desktop-video-upload-runner.ts auth pin");
assertIncludes(uploadRunner, "endDesktopVideoUploadTransaction", "desktop-video-upload-runner.ts lifecycle cleanup");
assertIncludes(uploadRunner, "uploadSignedVideoStorageWithProgress", "desktop-video-upload-runner.ts signed upload");
assertIncludes(uploadRunner, "uploadDirectVideoStorageWithProgress", "desktop-video-upload-runner.ts direct upload");
assertIncludes(uploadRunner, "saveDesktopVideoMetadataWithTransaction", "desktop-video-upload-runner.ts metadata insert");

const uploadTransaction = read("lib/desktop-video-upload-transaction.ts");
assertExport(uploadTransaction, "fetchWithDesktopVideoUploadTransaction", "desktop-video-upload-transaction.ts");
assertIncludes(uploadTransaction, "enterDesktopVideoUploadLifecycle", "desktop-video-upload-transaction.ts freeze auth");
assertIncludes(uploadTransaction, "stripRefreshTokensFromBody", "desktop-video-upload-transaction.ts strip refresh tokens");
assertIncludes(uploadTransaction, "runDesktopVideoUploadWithAbortSignal", "desktop-video-upload-transaction.ts abortable auth");

const uploadProgress = read("lib/desktop-video-upload-progress.ts");
assertIncludes(uploadProgress, "DESKTOP_VIDEO_UPLOAD_STALL_TIMEOUT_MS = 60_000", "desktop-video-upload-progress.ts 60s stall");
assertIncludes(uploadProgress, "runDesktopVideoUploadWithAbortSignal", "desktop-video-upload-progress.ts abort race");

const uploadTransfer = read("lib/desktop-video-upload-transfer.ts");
assertIncludes(uploadTransfer, "xhr.upload.onprogress", "desktop-video-upload-transfer.ts real byte progress");

const uploadRoute = read("app/api/video-upload/route.ts");
assertIncludes(uploadRoute, "requireBearerOnlyMatchingUserId", "video-upload route bearer-only auth");
assertNotIncludes(uploadRoute, "verifyRefreshTokenUserId", "video-upload route must not verify refresh tokens");

const authSessionGuard = read("lib/desktop-upload-auth-session-guard.ts");
assertExport(authSessionGuard, "refreshDesktopSupabaseSessionWhenSafe", "desktop-upload-auth-session-guard.ts");
assertIncludes(authSessionGuard, "isDesktopVideoUploadLifecycleActive", "desktop-upload-auth-session-guard.ts upload guard");

const clientApiAuth = read("lib/client-api-auth.ts");
assertIncludes(clientApiAuth, "isDesktopVideoUploadLifecycleActive", "client-api-auth.ts upload lifecycle guard");
assertNotIncludes(clientApiAuth, 'credentials: "omit"', "client-api-auth.ts must not fallback to Vercel SSO cookies");
assertIncludes(clientApiAuth, "isSameOriginDesktopApiUrl", "client-api-auth.ts blocks unauthenticated /api calls");

assertNotIncludes(actionPipeline, "isDesktopVideoUploadLifecycleActive", "desktop-protected-action-pipeline.ts no upload lifecycle branch");

const authState = read("lib/desktop-auth-state.tsx");
assertIncludes(authState, "isDesktopVideoUploadLifecycleActive", "desktop-auth-state.tsx upload lifecycle guard");

const supabaseAuthClient = read("lib/supabase-auth-client.ts");
assertExport(supabaseAuthClient, "createDesktopSupabaseAuthClient", "supabase-auth-client.ts");
assertExport(supabaseAuthClient, "createDesktopSupabaseServerStubClient", "supabase-auth-client.ts");
assertIncludes(supabaseAuthClient, "assertDirectSupabaseAuthUrl", "supabase-auth-client.ts direct host guard");
assertIncludes(supabaseAuthClient, "*.supabase.co", "supabase-auth-client.ts requires supabase.co host");
assertNotIncludes(supabaseAuthClient, "createSupabaseAuthFetch", "supabase-auth-client.ts must not wrap auth fetch");
assertNotIncludes(supabaseAuthClient, "fetch: authFetch", "supabase-auth-client.ts must not inject custom fetch");
assertNotIncludes(supabaseAuthClient, "globalThis.fetch", "supabase-auth-client.ts must not patch global fetch");
assertIncludes(supabaseAuthClient, "DESKTOP_BROWSER_CLIENT_KEY", "supabase-auth-client.ts single browser client key");

const supabaseBarrel = read("lib/supabase.ts");
assertExport(supabaseBarrel, "getDesktopSupabaseClient", "supabase.ts");
assertIncludes(supabaseBarrel, "__mdb_desktop_supabase_client__", "supabase.ts shares single client key");

const supabaseConfig = read("lib/supabase-config.ts");
assertIncludes(supabaseConfig, "SUPABASE_PROJECT_URL", "supabase-config.ts locked project URL");
assertIncludes(supabaseConfig, "vercel.app", "supabase-config.ts rejects Vercel site URL for auth");
assertIncludes(supabaseConfig, "return SUPABASE_PROJECT_URL", "supabase-config.ts pins login URL to project host");

const authUserMetadata = read("lib/auth-user-metadata.ts");
assertIncludes(authUserMetadata, "musicData", "auth-user-metadata.ts forbids musicData");
assertIncludes(authUserMetadata, "buildAuthUserMetadataAdminPatch", "auth-user-metadata.ts admin null-patch");
assertIncludes(authUserMetadata, "ALLOWED_AUTH_USER_METADATA_KEYS", "auth-user-metadata.ts allowlist");
assertExport(authUserMetadata, "buildSignupUserMetadata", "auth-user-metadata.ts");
assertExport(authUserMetadata, "assertSafeAuthUserMetadata", "auth-user-metadata.ts");

const syncAuthMetadata = read("lib/sync-auth-user-metadata.ts");
assertIncludes(syncAuthMetadata, "buildAuthUserMetadataAdminPatch", "sync-auth-user-metadata.ts nulls legacy keys");
assertIncludes(syncAuthMetadata, "assertSafeAuthUserMetadata", "sync-auth-user-metadata.ts size/safe guard");

const repairMetadataHandler = read("lib/repair-metadata-handler.ts");
assertIncludes(repairMetadataHandler, "status: 410", "repair-metadata-handler.ts public repair disabled");
assertIncludes(repairMetadataHandler, "scripts/repair-owner-auth-metadata.mjs", "repair-metadata-handler.ts points to local script");

const edgeProxy = read("proxy.ts");
assertIncludes(edgeProxy, "/api/auth/repair-metadata", "proxy.ts only matches repair routes");
assertNotIncludes(edgeProxy, '"/auth"', "proxy.ts must not match /auth");
assertIncludes(edgeProxy, "never proxied", "proxy.ts documents direct Supabase auth");

const scrollCss = read("lib/desktop-content-scroll.ts");
assertIncludes(scrollCss, "overflow-y: auto", "desktop-content-scroll.ts vertical scroll");
assertIncludes(scrollCss, "overflow-x: auto", "desktop-content-scroll.ts horizontal scroll");
if (/\bpreventDefault\s*\(/.test(scrollCss)) {
  fail("desktop-content-scroll.ts must not call preventDefault on wheel events");
} else {
  pass("desktop-content-scroll.ts does not call preventDefault");
}

const navigationScroll = read("lib/navigation-scroll.ts");
assertIncludes(navigationScroll, "data-main-scroll-container", "navigation-scroll.ts main container selector");
assertIncludes(navigationScroll, "scheduleNavigationScrollReset", "navigation-scroll.ts schedule helper");
assertIncludes(navigationScroll, "scrollContainerToElement", "navigation-scroll.ts destination pin");
assertIncludes(navigationScroll, "buildActiveNavigationKey", "navigation-scroll.ts active view key");
assertIncludes(navigationScroll, 'behavior: "auto"', "navigation-scroll.ts instant scroll");
assertExport(navigationScroll, "resetNavigationScroll", "lib/navigation-scroll.ts");
assertExport(navigationScroll, "focusPageHeadingAfterNavigation", "lib/navigation-scroll.ts");
assertExport(navigationScroll, "isNavigationScrollLocked", "lib/navigation-scroll.ts");

// --- page.tsx wiring invariants ---
const page = read("app/page.tsx");

const REQUIRED_PAGE_WIRING = [
  "createDesktopProtectedActionAuthGuard",
  "desktopActionAuthGuard",
  "dispatchDesktopSongLike",
  "registerDesktopProductionSessionPublisher",
  "requireDesktopUploadUserId",
  "createDesktopActionRuntime",
  "desktopActionFetch",
  "desktopNavAccess",
  "DesktopAuthProvider",
  "canRenderDesktopApplicationShell",
  "startDesktopAuthSessionBootstrap",
  "markDesktopAuthSignInPending",
  "isDesktopApiReady",
  "authSessionInitialized",
  "protectedActionsReady",
  "guardDesktopProtectedAction",
  "isDesktopProtectedActionsEnabled",
  "getAccountDisplayName",
  "canDeleteDesktopUploadedItem",
  "uploadsBlockedForCurrentUser",
  "DesktopAppSidebarNav",
  "DesktopContentScrollRoot",
  "scheduleNavigationScrollReset",
  "data-page-heading",
  "runDesktopVideoUpload",
  "applyVideoUploadProgressUpdate",
  "refreshDesktopSupabaseSessionWhenSafe",
  "syncDesktopUploadSession",
  "DESKTOP_VIDEO_UPLOAD_STALL_ERROR_MESSAGE",
];

for (const symbol of REQUIRED_PAGE_WIRING) {
  assertIncludes(page, symbol, "app/page.tsx wiring");
}

const DESKTOP_NAV_VIEWS = [
  "Home",
  "Marketplace",
  "Ringtone Marketplace",
  "My Purchased Ringtones",
  "Sales",
  "License History",
  "Trending",
  "Beats",
  "Artists",
  "Videos",
  "Library",
  "Liked",
  "Following",
  "Playlists",
  "Artist Dashboard",
  "Producer Dashboard",
  "My Ringtones",
  "Recently Played",
  "Queue",
  "Profile",
];

for (const view of DESKTOP_NAV_VIEWS) {
  if (!page.includes(`"${view}"`) && !page.includes(`'${view}'`)) {
    warn(`app/page.tsx: view \`${view}\` may not be wired (string not found)`);
  } else {
    pass(`app/page.tsx references view ${view}`);
  }
}

// Protected actions must use shared guard, not stale isAuthenticated-only checks in handlers
const PROTECTED_HANDLER_MARKERS = [
  ["toggleLike", "guardDesktopProtectedAction"],
  ["toggleArtistFollow", "guardDesktopProtectedAction"],
  ["saveLibraryItem", "guardDesktopProtectedAction"],
  ["createPlaylist", "guardDesktopProtectedAction"],
  ["uploadVideoToSupabase", "guardDesktopProtectedAction"],
  ["addSongToPlaylist", "desktopActionAuthGuard.hasAccess()"],
];

for (const [handler, marker] of PROTECTED_HANDLER_MARKERS) {
  if (!page.includes(handler)) {
    fail(`app/page.tsx: missing handler \`${handler}\``);
  } else if (!page.includes(marker)) {
    fail(`app/page.tsx: \`${handler}\` must gate via shared guard (\`${marker}\`)`);
  } else {
    pass(`app/page.tsx handler ${handler} uses shared guard`);
  }
}

// Delete visibility must use runtime helper with session, not isAuthenticated alone
if (page.includes("canDeleteUploadedSong")) {
  assertIncludes(page, "canDeleteDesktopUploadedItem", "canDeleteUploadedSong");
  assertIncludes(page, "authSession: authSessionRef.current", "delete visibility");
}

// Profile must resolve via runtime display helper
assertIncludes(page, "desktopRuntime.resolveDisplayName", "profile display name");

// Upload UI guards
assertIncludes(page, "disabled={videoUploadBusy}", "video upload save disabled while busy");
assertIncludes(page, "videoUploadBusy ? \"Uploading...\"", "video upload busy label");

// --- Forbidden touch zones (informational + doc presence) ---
const FORBIDDEN_PATHS = [
  "app/api/",
  "lib/supabase-config.ts",
  "lib/auth-session.ts",
  "app/layout.tsx",
];

const lockDoc = read("docs/desktop-regression-lock.md");
for (const zone of FORBIDDEN_PATHS) {
  if (!lockDoc.includes(zone.replace(/\/$/, "")) && !lockDoc.includes(zone)) {
    warn(`docs/desktop-regression-lock.md should document forbidden zone: ${zone}`);
  }
}

// --- Summary ---
console.log(`\nPassed checks: ${passed.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Failures: ${failures.length}\n`);

if (warnings.length) {
  console.log("Warnings:");
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("");
}

if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\n${failures.length} failure(s). Fix before commit or deploy.\n`);
  process.exit(1);
}

console.log("✓ Desktop regression lock static checks passed.");
console.log("  Manual: log in, upload 33MB MP4, verify library + session, spot-check sidebar pages.\n");
process.exit(0);
