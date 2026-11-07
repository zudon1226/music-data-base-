/**
 * Regenerate public/pwa icons from the canonical iOS App Store asset (MDB branding).
 * Requires: npx sharp-cli (pulled on demand).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
const outDir = join(root, "public/pwa");
const sizes = [44, 50, 150, 192, 310, 512];

if (!existsSync(source)) {
  console.error("Missing source icon:", source);
  process.exit(1);
}

for (const size of sizes) {
  const out = join(outDir, `icon-${size}.png`);
  const result = spawnSync(
    "npx",
    ["--yes", "sharp-cli", "-i", source, "-o", out, "resize", String(size), String(size)],
    { cwd: root, stdio: "inherit", shell: true },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(JSON.stringify({ icons: "ok", sizes, outDir: "public/pwa" }, null, 2));
