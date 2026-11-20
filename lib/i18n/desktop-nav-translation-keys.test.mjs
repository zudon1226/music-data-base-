import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const navKeys = readFileSync(join(root, "nav-keys.ts"), "utf8");
const navigation = readFileSync(join(root, "..", "desktop-app-navigation.ts"), "utf8");

assert.match(navKeys, /Mixtapes:\s+"nav\.mixtapes"/, "Mixtapes nav translation key");
assert.match(navKeys, /"Mixtape Studio":\s+"nav\.mixtapeStudio"/, "Mixtape Studio nav translation key");

const views = [...navigation.matchAll(/\{\s*view:\s*"([^"]+)"/g)].map((m) => m[1]);
assert.ok(views.includes("Mixtapes"), "DESKTOP_NAV_ITEMS includes Mixtapes");
assert.ok(views.includes("Mixtape Studio"), "DESKTOP_NAV_ITEMS includes Mixtape Studio");

for (const view of views) {
    const escaped = view.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`"${escaped}":\\s+"([^"]+)"`);
    const inNavKeys = pattern.test(navKeys);
    const inViewTitle = new RegExp(`${escaped}:\\s+"[^"]+"`).test(navKeys);
    assert.ok(inNavKeys || inViewTitle, `missing translation mapping for view "${view}" in nav-keys.ts`);
}

const en = readFileSync(join(root, "messages", "en.ts"), "utf8");
assert.match(en, /mixtapes:\s+"Mixtapes"/, "en nav.mixtapes string");
assert.match(en, /mixtapeStudio:\s+"Mixtape Studio"/, "en nav.mixtapeStudio string");
assert.match(en, /mixtapes:\s*\{[\s\S]*title:\s*"Mixtapes"/, "en mixtapes.title section");

console.log("desktop-nav-translation-keys.test.mjs: ok");