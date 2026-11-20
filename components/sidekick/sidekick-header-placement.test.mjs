/**
 * Sidekick desktop header placement regression (source contract).
 * Run: node components/sidekick/sidekick-header-placement.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const shell = readFileSync(join(root, "components/sidekick/sidekick-shell.tsx"), "utf8");
const shellCss = readFileSync(join(root, "components/sidekick/sidekick-shell.css"), "utf8");
const page = readFileSync(join(root, "app/page.tsx"), "utf8");

assert.match(shell, /headerLauncherMountRef/, "SidekickShell accepts header launcher mount ref");
assert.match(shell, /sidekick-launcher--header/, "header launcher class is applied");
assert.match(shellCss, /\.sidekick-launcher:not\(\.sidekick-launcher--header\)/, "floating styles skip header launcher");
assert.match(page, /sidekickHeaderLauncherRef/, "page defines header launcher slot ref");
assert.match(page, /sidekick-header-launcher-slot/, "header slot beside topbar actions");
assert.match(
    page,
    /headerLauncherMountRef=\{isMobileCompact \? undefined : sidekickHeaderLauncherRef\}/,
    "mobile keeps floating launcher; desktop uses header slot",
);

const slotIndex = page.indexOf('className="sidekick-header-launcher-slot"');
const notificationIndex = page.indexOf("<NotificationCenterPanel");
assert.ok(slotIndex > notificationIndex, "Sidekick slot follows notification panel in source order");

console.log("sidekick-header-placement.test.mjs passed.");