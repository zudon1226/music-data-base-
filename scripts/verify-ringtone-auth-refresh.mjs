#!/usr/bin/env node
/**
 * Ringtone creator auth: live session token + refresh-on-401 contracts.
 * Run: node scripts/verify-ringtone-auth-refresh.mjs
 */
import { existsSync, readFileSync } from "node:fs";
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

const client = read("lib/ringtone-creator-client.ts");
const auth = read("lib/client-api-auth.ts");
const route = read("app/api/ringtones/route.ts");
const requestAuth = read("lib/request-auth.ts");

record(
    "ringtone client uses authFetch (not stale session prop token)",
    client.includes("authFetch")
        && client.includes("getDesktopSupabaseClient")
        && client.includes("ringtoneAuthFetch")
        && !client.includes("readAccessTokenFromSession")
        && !/Authorization\s*=\s*`Bearer \$\{token\}`/.test(client)
        && !/function authHeaders/.test(client),
);
record(
    "ringtone save/submit go through ringtoneAuthFetch",
    /saveRingtoneDraft[\s\S]{0,500}ringtoneAuthFetch\("\/api\/ringtones"/.test(client)
        && /submitRingtoneForReview[\s\S]{0,400}ringtoneAuthFetch\(`\/api\/ringtones\/\$\{input\.ringtoneId\}\/process`/.test(client),
);
record(
    "authFetch refreshes expired sessions before request",
    auth.includes("readSessionAccessToken")
        && auth.includes("allowRefresh: true")
        && auth.includes("isAccessTokenExpired")
        && auth.includes("refreshSupabaseSession"),
);
record(
    "authFetch retries once with forceRefresh on 401",
    auth.includes("forceRefresh: true")
        && auth.includes("nextToken !== accessToken")
        && /response\.status === 401[\s\S]{0,400}forceRefresh:\s*true/.test(auth),
);
record(
    "authFetch sets Authorization Bearer from live token",
    auth.includes('headers.set("Authorization", `Bearer ${accessToken}`)'),
);
record(
    "server still requires matching JWT user id",
    route.includes("requireMatchingUserId")
        && requestAuth.includes("verifyAccessTokenUserId")
        && requestAuth.includes("auth.getUser(accessToken)")
        && !route.includes("bypass"),
);
record(
    "unauthorized still 401 when token missing/invalid",
    requestAuth.includes('status: 401')
        && requestAuth.includes("Missing or invalid Authorization bearer token"),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
