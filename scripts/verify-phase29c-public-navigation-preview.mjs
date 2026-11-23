/**
 * Phase 29C — Preview guest navigation smoke (HTTP).
 * Usage: PREVIEW_BASE_URL=https://music-data-base-pwa-clean-git-baseline-recovered-87wa50fw8.vercel.app node scripts/verify-phase29c-public-navigation-preview.mjs
 * For Vercel Deployment Protection, run via: npx vercel curl $URL (manual) or disable protection for smoke window.
 */
import process from "node:process";

const base = (process.env.PREVIEW_BASE_URL || "").replace(/\/+$/, "");
const failures = [];

if (!base) {
    console.error("PREVIEW_BASE_URL required");
    process.exit(1);
}

async function get(path) {
    const response = await fetch(`${base}${path}`, { redirect: "follow" });
    const text = await response.text();
    return { status: response.status, text };
}

async function postJson(path, body) {
    const response = await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
}

const routes = ["/", "/music", "/videos", "/ringtones", "/mixtapes", "/podcast"];

for (const route of routes) {
    const { status } = await get(route);
    if (status !== 200) failures.push(`${route} expected 200 got ${status}`);
    else console.log(`PASS ${route} -> ${status}`);
}

const songs = await get("/api/songs");
if (songs.status !== 200) failures.push(`/api/songs status ${songs.status}`);
else if (!songs.text.includes("jzlegcbotqfzevtczwhx") && !songs.text.includes('"songs"')) {
    failures.push("/api/songs blocked or not JSON (use vercel curl when Deployment Protection is on)");
} else if (songs.text.includes("jzlegcbotqfzevtczwhx")) {
    console.log("PASS /api/songs -> staging Supabase host");
} else {
    console.log("WARN /api/songs JSON ok but staging host not visible in body");
}

const marketGet = await get("/api/ringtones/marketplace");
let marketBody = {};
try {
    marketBody = JSON.parse(marketGet.text || "{}");
} catch {
    marketBody = {};
}
if (marketGet.status !== 200) failures.push("ringtones marketplace GET failed");
else if (!marketBody.publicBetaPaidPurchaseLocked) {
    failures.push("publicBetaPaidPurchaseLocked must stay true on Preview");
} else if (marketBody.paidCheckoutAvailable) {
    failures.push("paidCheckoutAvailable must stay false on Preview");
} else {
    console.log("PASS ringtone marketplace beta lock");
}

const guestUpload = await postJson("/api/upload-audio", {});
if (guestUpload.status !== 401) {
    failures.push(`guest POST /api/upload-audio expected 401 got ${guestUpload.status} (${guestUpload.json?.error || ""})`);
} else {
    console.log("PASS guest upload-audio -> 401");
}

if (failures.length) {
    console.error("verify-phase29c-public-navigation-preview.mjs FAILED:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-phase29c-public-navigation-preview.mjs: ok");