/**
 * Static PWA readiness checks for Microsoft Store / PWABuilder (repo-local).
 * Usage: node scripts/verify-pwa-microsoft-store.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const manifestPath = "app/manifest.ts";
const pwaLibPath = "lib/pwa/mdb-pwa.ts";
record("app/manifest.ts", existsSync(join(root, manifestPath)));
record("lib/pwa/mdb-pwa.ts", existsSync(join(root, pwaLibPath)));
const manifest = existsSync(join(root, manifestPath)) ? read(manifestPath) : "";
const pwaLib = existsSync(join(root, pwaLibPath)) ? read(pwaLibPath) : "";
record("manifest display standalone", manifest.includes('display: "standalone"'));
record("manifest id production origin", pwaLib.includes("https://www.digitalmusicdatabase.com/"));
record("manifest name Music Data Base", pwaLib.includes("Music Data Base"));
record("manifest icon size table", pwaLib.includes("44") && pwaLib.includes("310") && pwaLib.includes("512"));
record("manifest 192/512 icon sizes", pwaLib.includes("192") && pwaLib.includes("512"));

const swPath = "public/sw.js";
record("public/sw.js", existsSync(join(root, swPath)));
const sw = existsSync(join(root, swPath)) ? read(swPath) : "";
record("SW network-only (no cache.put)", !/cache\.put/i.test(sw));
record("SW clears legacy caches on activate", /caches\.keys/.test(sw) && /caches\.delete/.test(sw));

const registrar = read("components/pwa/register-service-worker.tsx");
record("SW registrar component", existsSync(join(root, "components/pwa/register-service-worker.tsx")));
record("Registrar skips Capacitor native", registrar.includes("isCapacitorNativeShell"));
record("layout mounts registrar", read("app/layout.tsx").includes("RegisterPwaServiceWorker"));

for (const size of [44, 50, 150, 192, 310, 512]) {
  const rel = `public/pwa/icon-${size}.png`;
  record(`icon ${size}x${size}`, existsSync(join(root, rel)));
}

const nextConfig = read("next.config.ts");
record("next.config sw headers", /\/sw\.js/.test(nextConfig));

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(failed.length ? `FAIL ${failed.length}/${results.length}` : `PASS ${results.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
