/**
 * Autoplay toggle verification (logic + i18n keys + source wiring).
 * Usage: node scripts/verify-player-autoplay.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(root, "lib/i18n/messages");
const requiredKeys = ["autoplay", "autoplayOn", "autoplayOff"];
let failed = false;

function fail(message) {
    failed = true;
    console.log(`FAIL ${message}`);
}

function pass(message) {
    console.log(`PASS ${message}`);
}

for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".ts")) continue;
    const text = readFileSync(join(messagesDir, file), "utf8");
    for (const key of requiredKeys) {
        if (!text.includes(`${key}:`)) {
            fail(`locale ${file} missing player.${key}`);
        }
    }
}
if (!failed) {
    pass("all locale files include player autoplay keys");
}

const page = readFileSync(join(root, "app/page.tsx"), "utf8");
const wiringChecks = [
    ["player-autoplay-control UI", /player-autoplay-control/],
    ["handleTrackEnded autoplay", /continueAutoplayFromCatalog/],
    ["autoplay persistence", /writeAutoplayEnabled/],
    ["user-initiated gate", /markUserInitiatedPlayback|notePlaybackUserInitiated/],
];
for (const [name, pattern] of wiringChecks) {
    if (pattern.test(page)) pass(name);
    else fail(name);
}

const unit = spawnSync(process.execPath, ["lib/player-autoplay.test.mjs"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
});
if (unit.status !== 0) {
    fail("player-autoplay unit tests");
}
else {
    pass("player-autoplay unit tests");
}

process.exit(failed ? 1 : 0);
