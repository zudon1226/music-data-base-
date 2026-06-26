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

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
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
  }
}

function assertNotIncludes(content, needle, context) {
  if (content.includes(needle)) {
    fail(`${context}: must not contain \`${needle}\` (regression risk)`);
  }
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
  }
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
  "components/desktop-app-sidebar-nav.tsx",
  "docs/desktop-regression-lock.md",
];

for (const mod of REQUIRED_DESKTOP_MODULES) {
  if (!existsSync(join(ROOT, mod))) {
    fail(`Missing required file: ${mod}`);
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
assertIncludes(pipeline, "DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS = 494", "desktop-authenticated-request-pipeline.ts 494 handler");
assertIncludes(pipeline, "Authorization", "desktop-authenticated-request-pipeline.ts bearer header");
assertIncludes(pipeline, 'authMode: "bearer-preferred"', "desktop-authenticated-request-pipeline.ts bearer-preferred default");
assertIncludes(pipeline, "forceRefresh: true", "desktop-authenticated-request-pipeline.ts 401 retry");
assertNotIncludes(pipeline, "preferRefreshHeader", "desktop-authenticated-request-pipeline.ts must not retry 401 with refresh-only");

const client = read("lib/desktop-protected-action-client.ts");
assertExport(client, "createDesktopProtectedActionClient", "desktop-protected-action-client.ts");
assertIncludes(client, "desktop-authenticated-request-pipeline", "desktop-protected-action-client.ts re-exports pipeline");

const nav = read("lib/desktop-app-navigation.ts");
assertExport(nav, "evaluateDesktopNavAccess", "desktop-app-navigation.ts");
assertExport(nav, "hasDesktopAccountAccess", "desktop-app-navigation.ts");
assertExport(nav, "createDesktopNavHandler", "desktop-app-navigation.ts");

const bootstrap = read("lib/desktop-app-bootstrap.ts");
assertExport(bootstrap, "canRenderDesktopApplicationShell", "desktop-app-bootstrap.ts");

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
];

for (const symbol of REQUIRED_PAGE_WIRING) {
  assertIncludes(page, symbol, "app/page.tsx wiring");
}

// Protected actions must use shared guard, not stale isAuthenticated-only checks in handlers
const PROTECTED_HANDLER_MARKERS = [
  ['toggleLike', 'requireDesktopActionUserId("Log in before liking songs.")'],
  ['toggleArtistFollow', 'requireDesktopActionUserId("Log in before following artists.")'],
  ['saveLibraryItem', 'requireDesktopActionUserId("Log in before saving to Library.")'],
  ['addSongToPlaylist', 'desktopActionAuthGuard.hasAccess()'],
];

for (const [handler, marker] of PROTECTED_HANDLER_MARKERS) {
  if (!page.includes(handler)) {
    fail(`app/page.tsx: missing handler \`${handler}\``);
  } else if (!page.includes(marker)) {
    fail(`app/page.tsx: \`${handler}\` must gate via shared guard (\`${marker}\`)`);
  }
}

// Delete visibility must use runtime helper with session, not isAuthenticated alone
if (page.includes("canDeleteUploadedSong")) {
  assertIncludes(page, "canDeleteDesktopUploadedItem", "canDeleteUploadedSong");
  assertIncludes(page, "authSession: authSessionRef.current", "delete visibility");
}

// Profile must resolve via runtime display helper
assertIncludes(page, "desktopRuntime.resolveDisplayName", "profile display name");

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

// --- Feature checklist documented ---
const REQUIRED_FEATURES = [
  "Login",
  "Session persistence",
  "Home opens",
  "Sidebar navigation",
  "Profile name",
  "Play",
  "Queue",
  "Like",
  "Follow",
  "Save",
  "Add to playlist",
  "Delete button visibility",
  "Upload button visibility",
];

for (const feature of REQUIRED_FEATURES) {
  if (!lockDoc.toLowerCase().includes(feature.toLowerCase().split(" ")[0])) {
    warn(`Checklist may be missing feature: ${feature}`);
  }
}

// --- Summary ---
console.log(`Checked ${REQUIRED_DESKTOP_MODULES.length} module paths`);
console.log(`Checked ${REQUIRED_PAGE_WIRING.length} page.tsx wiring symbols`);
console.log(`Checked ${REQUIRED_FEATURES.length} documented features\n`);

if (warnings.length) {
  console.log("Warnings:");
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("");
}

if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\n${failures.length} failure(s). Fix before changing desktop glue.\n`);
  process.exit(1);
}

console.log("✓ Desktop regression lock static checks passed.");
console.log("  Next: complete manual checklist in docs/desktop-regression-lock.md\n");
process.exit(0);
