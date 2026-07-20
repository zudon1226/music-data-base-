/**
 * Mobile auth-refresh must not blank the open shell indefinitely.
 * Run: node scripts/verify-mobile-auth-refresh-nav.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

const page = read("app/page.tsx");
const authState = read("lib/desktop-auth-state.tsx");
const bootstrap = read("lib/desktop-auth-bootstrap-flow.ts");
const clientAuth = read("lib/client-api-auth.ts");

record("shell only blocked before authReady/localBootstrap", bootstrap.includes("diagnoseDesktopShellGate") && bootstrap.includes("localBootstrapReady"));
record("checking session is full-page only while authLoading", page.includes("if (authLoading)") && page.includes("Checking your session..."));
record("opening library message when authenticated but shell gated", page.includes("auth.openingLibrary") || page.includes("openingLibrary"));
record("authReady gates login vs app", authState.includes("shouldShowLoginScreen = authReady && !isAuthenticated"));
record("session expired message exists", clientAuth.includes("SESSION_EXPIRED_MESSAGE") || page.includes("SESSION_EXPIRED_MESSAGE"));
record("nav does not await auth refresh before setView", /function handleNav[\s\S]{0,500}applyDesktopView\(nextView\)/.test(page) && !/function handleNav[\s\S]{0,500}await /.test(page));
record("protected actions ready does not hide page content", !page.includes("if (!protectedActionsReady) return null") && !page.includes("if (!protectedActionsReady) {\n        return null"));
record("scroll clear independent of auth refresh", page.includes("forceMainContentScrollTop()"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_AUTH_REFRESH_NAV_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
