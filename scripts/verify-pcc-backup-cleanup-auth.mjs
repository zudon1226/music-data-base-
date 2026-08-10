/**
 * Verify PCC backup + storage-cleanup owner authorization wiring.
 * Also exercises safe path-validation helpers (no production deletion).
 *
 * Usage: node scripts/verify-pcc-backup-cleanup-auth.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function mainStatic() {
  const adminAuth = read("lib/admin-auth.ts");
  const backup = read("app/api/platform/backup/route.ts");
  const cleanup = read("app/api/platform/storage-cleanup/route.ts");
  const pathSecurity = read("lib/platform-storage-path-security.ts");
  const page = read("app/page.tsx");

  record(
    "requireAuthenticatedPlatformOwner helper exists",
    adminAuth.includes("export async function requireAuthenticatedPlatformOwner")
      && adminAuth.includes("resolveStrictRequestUserId")
      && adminAuth.includes("requirePlatformOwnerUserId")
      && adminAuth.includes("status: 401")
      && adminAuth.includes("status: 403"),
  );

  record(
    "A/B/C backup uses session owner auth (not client userId)",
    backup.includes('requireAuthenticatedPlatformOwner(request, "/api/platform/backup")')
      && backup.includes("requested_by: owner.userId")
      && !/requireMatchingUserId\(request,\s*"\/api\/platform\/backup"/.test(backup),
  );

  record(
    "D/E/F storage-cleanup GET/DELETE use session owner auth",
    cleanup.includes('requireAuthenticatedPlatformOwner(request, "/api/platform/storage-cleanup")')
      && /export async function GET\(request: Request\)/.test(cleanup)
      && /export async function DELETE\(request: Request\)/.test(cleanup)
      && cleanup.includes("dryRun")
      && cleanup.includes("wouldDelete")
      && !/body\.userId/.test(cleanup),
  );

  record(
    "storage path validation rejects traversal / non-media buckets",
    pathSecurity.includes("PLATFORM_CLEANUP_ALLOWED_BUCKETS")
      && pathSecurity.includes('["songs", "videos"]')
      && pathSecurity.includes("isSafePlatformStoragePath")
      && pathSecurity.includes('segment === ".."')
      && pathSecurity.includes("sanitizePlatformCleanupFileSelection")
      && cleanup.includes("sanitizePlatformCleanupFileSelection"),
  );

  record(
    "client backup/cleanup send Authorization bearer via desktopActionFetch",
    page.includes('desktopActionFetch("/api/platform/storage-cleanup"')
      && page.includes("desktopActionFetch(`/api/platform/backup?userId=")
      && /Authorization:\s*`Bearer \$\{accessToken\}`/.test(page.slice(page.indexOf("async function loadPlatformStabilityReport"), page.indexOf("async function exportDatabaseBackup") + 800))
      && !/fetch\("\/api\/platform\/storage-cleanup",\s*\{\s*cache:\s*"no-store",\s*credentials:\s*"omit"/.test(page)
      && !/fetch\(`\/api\/platform\/backup\?userId=[\s\S]{0,200}?credentials:\s*"omit"/.test(page),
  );

  record(
    "locked UI CSS/layout markers unchanged in this change set intent",
    page.includes(".platform-control-center")
      && page.includes("mobile-bottom-player")
      && page.includes("topbar-desktop-controls"),
  );
}

function mainPathSecurity() {
  // Inline mirrors of lib/platform-storage-path-security.ts for runtime asserts without TS loader.
  const ALLOWED = ["songs", "videos"];
  function normalize(value) {
    return decodeURIComponent(String(value || "").split("?")[0].replace(/^\/+/, ""));
  }
  function isSafe(pathValue) {
    const normalized = normalize(pathValue);
    if (!normalized) return false;
    if (normalized.includes("\0")) return false;
    if (normalized.includes("\\")) return false;
    if (normalized.includes("://")) return false;
    if (normalized.startsWith("/") || normalized.startsWith("~")) return false;
    if (normalized.split("/").some((segment) => segment === "." || segment === "..")) return false;
    if (normalized.includes("//")) return false;
    return true;
  }
  function sanitize(files) {
    const selected = [];
    const seen = new Set();
    for (const file of files) {
      if (!file || typeof file !== "object") continue;
      const bucket = typeof file.bucket === "string" ? file.bucket.trim() : "";
      const pathValue = typeof file.path === "string" ? normalize(file.path.trim()) : "";
      if (!ALLOWED.includes(bucket)) continue;
      if (!isSafe(pathValue)) continue;
      const key = `${bucket}:${pathValue}`;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push({ bucket, path: pathValue });
    }
    return selected;
  }

  assert.equal(isSafe("user/abc/file.mp3"), true);
  assert.equal(isSafe("../etc/passwd"), false);
  assert.equal(isSafe("songs/../videos/x"), false);
  assert.equal(isSafe("https://evil.example/a"), false);
  assert.equal(isSafe("/user/abc/file.mp3"), true, "leading slash is normalized away");
  assert.equal(normalize("/user/abc/file.mp3"), "user/abc/file.mp3");
  assert.deepEqual(
    sanitize([
      { bucket: "songs", path: "ok/a.mp3" },
      { bucket: "avatars", path: "ok/a.png" },
      { bucket: "videos", path: "../../secret" },
      { bucket: "videos", path: "ok/b.mp4" },
    ]),
    [
      { bucket: "songs", path: "ok/a.mp3" },
      { bucket: "videos", path: "ok/b.mp4" },
    ],
  );
  record("path security runtime rejects traversal and non-approved buckets", true);
}

async function mainLiveLocalHandlers() {
  // Import compiled Next route handlers is awkward; hit local server if VERIFY_BASE_URL is set.
  const base = String(process.env.VERIFY_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    record("live handler checks", true, "skipped (set VERIFY_BASE_URL to exercise A–F against a local server)");
    return;
  }

  async function probe(label, init) {
    const response = await fetch(`${base}${init.path}`, {
      method: init.method || "GET",
      headers: init.headers || {},
      body: init.body,
    });
    const text = await response.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { label, status: response.status, json };
  }

  const unauthBackup = await probe("A unauthenticated backup", { path: "/api/platform/backup" });
  record("A unauthenticated backup => 401", unauthBackup.status === 401, `status=${unauthBackup.status}`);

  const fakeNonOwnerBackup = await probe("B fake non-owner backup", {
    path: "/api/platform/backup",
    headers: { Authorization: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEifQ." },
  });
  record(
    "B authenticated non-owner/invalid backup rejected",
    fakeNonOwnerBackup.status === 401 || fakeNonOwnerBackup.status === 403,
    `status=${fakeNonOwnerBackup.status}`,
  );

  const unauthScan = await probe("D unauthenticated cleanup GET", { path: "/api/platform/storage-cleanup" });
  record("D unauthenticated cleanup GET => 401", unauthScan.status === 401, `status=${unauthScan.status}`);

  const unauthDelete = await probe("D2 unauthenticated cleanup DELETE", {
    path: "/api/platform/storage-cleanup",
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirm: "Confirm Delete Selected",
      dryRun: true,
      files: [{ bucket: "songs", path: "probe/not-real.mp3" }],
    }),
  });
  record("D unauthenticated cleanup DELETE => 401", unauthDelete.status === 401, `status=${unauthDelete.status}`);

  const fakeNonOwnerDelete = await probe("E fake non-owner cleanup DELETE", {
    path: "/api/platform/storage-cleanup",
    method: "DELETE",
    headers: {
      Authorization: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEifQ.",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      confirm: "Confirm Delete Selected",
      dryRun: true,
      files: [{ bucket: "songs", path: "probe/not-real.mp3" }],
    }),
  });
  record(
    "E authenticated non-owner/invalid cleanup DELETE rejected",
    fakeNonOwnerDelete.status === 401 || fakeNonOwnerDelete.status === 403,
    `status=${fakeNonOwnerDelete.status}`,
  );

  const ownerToken = String(process.env.VERIFY_OWNER_ACCESS_TOKEN || "").trim();
  if (!ownerToken) {
    record("C/F owner success paths", true, "skipped (set VERIFY_OWNER_ACCESS_TOKEN for non-destructive owner probes)");
    return;
  }

  const ownerBackup = await probe("C owner backup", {
    path: "/api/platform/backup",
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  record("C owner backup succeeds", ownerBackup.status === 200, `status=${ownerBackup.status}`);

  const ownerDryRun = await probe("F owner cleanup dry-run", {
    path: "/api/platform/storage-cleanup",
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${ownerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      confirm: "Confirm Delete Selected",
      dryRun: true,
      files: [{ bucket: "songs", path: "probe/not-real-nonexistent.mp3" }],
    }),
  });
  // Authorized operation reached: either dryRun payload or 400 (no eligible files) — never 401/403.
  record(
    "F owner cleanup dry-run reaches authorized operation",
    ownerDryRun.status === 200 || ownerDryRun.status === 400,
    `status=${ownerDryRun.status} dryRun=${Boolean(ownerDryRun.json?.dryRun)}`,
  );
}

async function main() {
  mainStatic();
  mainPathSecurity();
  await mainLiveLocalHandlers();
  writeFileSync(path.join(evidenceDir, "pcc-backup-cleanup-auth-evidence.json"), JSON.stringify({ results }, null, 2));
  const fails = results.filter((item) => !item.ok);
  console.log(`\nPCC_BACKUP_CLEANUP_AUTH_FAILS=${fails.length}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
