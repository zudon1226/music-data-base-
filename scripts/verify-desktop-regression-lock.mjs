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
const REQUIRED_DESKTOP_MODULES = [
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

const runtime = read("lib/desktop-action-runtime.ts");
assertExport(runtime, "createDesktopActionRuntime", "desktop-action-runtime.ts");
assertExport(runtime, "resolveDesktopActionUserId", "desktop-action-runtime.ts");
assertExport(runtime, "hasUsableDesktopProtectedActionSession", "desktop-action-runtime.ts");
assertExport(runtime, "resolveDesktopProfileDisplayName", "desktop-action-runtime.ts");
assertExport(runtime, "canDeleteDesktopUploadedItem", "desktop-action-runtime.ts");

const pipeline = read("lib/desktop-authenticated-request-pipeline.ts");
assertExport(pipeline, "createDesktopAuthenticatedFetch", "desktop-authenticated-request-pipeline.ts");
assertExport(pipeline, "resolveDesktopAuthenticatedCredentials", "desktop-authenticated-request-pipeline.ts");

const authBootstrapFlow = read("lib/desktop-auth-bootstrap-flow.ts");
assertIncludes(authBootstrapFlow, "DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS = 494", "desktop-auth-bootstrap-flow.ts 494 handler");
assertIncludes(authBootstrapFlow, 'headers.set("Authorization"', "desktop-auth-bootstrap-flow.ts bearer header");
assertIncludes(authBootstrapFlow, '"bearer-preferred"', "desktop-auth-bootstrap-flow.ts bearer-preferred default");
assertIncludes(authBootstrapFlow, "forceRefresh:", "desktop-auth-bootstrap-flow.ts 401 retry");

const client = read("lib/desktop-protected-action-client.ts");
assertExport(client, "createDesktopProtectedActionClient", "desktop-protected-action-client.ts");
assertIncludes(client, "desktop-auth-bootstrap-flow", "desktop-protected-action-client.ts re-exports bootstrap flow");

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

const authBootstrap = read("lib/desktop-auth-bootstrap-flow.ts");
assertIncludes(authBootstrap, "isDesktopVideoUploadLifecycleActive", "desktop-auth-bootstrap-flow.ts upload lifecycle guard");

const authState = read("lib/desktop-auth-state.tsx");
assertIncludes(authState, "isDesktopVideoUploadLifecycleActive", "desktop-auth-state.tsx upload lifecycle guard");

const scrollCss = read("lib/desktop-content-scroll.ts");
assertIncludes(scrollCss, "overflow-y: auto", "desktop-content-scroll.ts vertical scroll");
assertIncludes(scrollCss, "overflow-x: auto", "desktop-content-scroll.ts horizontal scroll");
if (/\bpreventDefault\s*\(/.test(scrollCss)) {
  fail("desktop-content-scroll.ts must not call preventDefault on wheel events");
} else {
  pass("desktop-content-scroll.ts does not call preventDefault");
}

// --- page.tsx wiring invariants ---
const page = read("app/page.tsx");

const REQUIRED_PAGE_WIRING = [
  "createDesktopProtectedActionAuthGuard",
  "desktopActionAuthGuard",
  "requireDesktopActionUserId",
  "createDesktopActionRuntime",
  "desktopActionFetch",
  "desktopNavAccess",
  "DesktopAuthProvider",
  "canRenderDesktopApplicationShell",
  "getAccountDisplayName",
  "canDeleteDesktopUploadedItem",
  "uploadsBlockedForCurrentUser",
  "DesktopAppSidebarNav",
  "DesktopContentScrollRoot",
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
  ["toggleLike", 'requireDesktopActionUserId("Log in before liking songs.")'],
  ["toggleArtistFollow", 'requireDesktopActionUserId("Log in before following artists.")'],
  ["saveLibraryItem", "desktopActionAuthGuard.hasAccess()"],
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
