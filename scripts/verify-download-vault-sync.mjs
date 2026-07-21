/**
 * Download Vault synchronization contracts for paid-listener media downloads.
 * Run: node scripts/verify-download-vault-sync.mjs
 * Or: npm run verify:download-vault
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
const authLib = read("lib/media-download-auth.ts");
const songRoute = read("app/api/songs/[id]/download/route.ts");
const videoRoute = read("app/api/videos/[id]/download/route.ts");
const listRoute = read("app/api/media-downloads/route.ts");
const migrationBase = read("supabase/migrations/202607200002_media_listener_downloads.sql");
const migrationVault = read("supabase/migrations/202607210001_media_downloads_vault_sync.sql");
const pkg = read("package.json");
const mediaDownloadVerify = read("scripts/verify-paid-listener-media-download.mjs");

record("base media_downloads table migration present", migrationBase.includes("create table if not exists public.media_downloads"));
record(
    "vault sync migration adds title/count/unique",
    migrationVault.includes("add column if not exists title")
        && migrationVault.includes("last_downloaded_at")
        && migrationVault.includes("download_count")
        && migrationVault.includes("access_source")
        && migrationVault.includes("media_downloads_user_content_unique"),
);
record(
    "recordMediaDownloadEvent updates existing vault row",
    authLib.includes("recordMediaDownloadEvent")
        && authLib.includes("last_downloaded_at")
        && authLib.includes("download_count")
        && authLib.includes("access_source")
        && authLib.includes("paid_listener")
        && /prior\?\.id[\s\S]*update\(/.test(authLib)
        && /from\("media_downloads"\)\.insert/.test(authLib),
);
record(
    "download routes pass title + accessMode into history",
    songRoute.includes("title: song.title")
        && songRoute.includes("accessMode: entitlement.accessMode")
        && videoRoute.includes("accessMode: entitlement.accessMode")
        && videoRoute.includes("title:"),
);
record(
    "GET /api/media-downloads lists authenticated vault rows",
    listRoute.includes("export async function GET")
        && listRoute.includes("requireMatchingUserId")
        && listRoute.includes("media_downloads")
        && listRoute.includes("Paid listener download")
        && listRoute.includes("AUTH_REQUIRED"),
);
record(
    "page loads media download vault with bearer auth",
    page.includes("reloadMediaDownloadVault")
        && page.includes("/api/media-downloads?userId=")
        && page.includes("Authorization: `Bearer ${token}`")
        && page.includes("visibleMediaDownloadVault")
        && page.includes("downloadVaultTotalCount"),
);
record(
    "successful download refreshes vault immediately",
    /downloadMediaFromCard[\s\S]*setMediaDownloadVault[\s\S]*reloadMediaDownloadVault/.test(page)
        && page.includes("Re-download")
        && page.includes("Paid listener download")
        && page.includes("Purchased "),
);
record(
    "vault UI does not label listener downloads as purchases",
    page.includes("sourceLabel")
        && !/visibleMediaDownloadVault\.map[\s\S]{0,500}Purchased/.test(page)
        && page.includes("paid-listener music/video downloads will appear here"),
);
record("package exposes verify:download-vault", pkg.includes("verify:download-vault"));
record("media-download verifier still present", mediaDownloadVerify.includes("recordMediaDownloadEvent"));
record(
    "topbar / notification / ringtone paths unchanged by this verifier scope",
    existsSync(path.join(root, "scripts/verify-mobile-topbar-actions.mjs"))
        && existsSync(path.join(root, "scripts/verify-notification-nav-canonical.mjs"))
        && existsSync(path.join(root, "app/api/ringtones/[id]/download/route.ts")),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nDOWNLOAD_VAULT_SYNC_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
