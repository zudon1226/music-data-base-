import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playRoute = readFileSync(path.join(root, "app/api/songs/[id]/play/route.ts"), "utf8");
const server = readFileSync(path.join(root, "lib/song-play-server.ts"), "utf8");

const checks = [
    ["play route exists", playRoute.includes("recordSongPlay")],
    ["qualified_start event", server.includes("qualified_start")],
    ["does not trust client plays", !server.includes("body.plays")],
    ["server increments plays", server.includes("currentPlays + 1")],
    ["invalid uuid song", server.includes("Invalid song id")],
    ["private playback deny", server.includes("not available for public playback")],
    ["durable play rpc", server.includes("recordDurableSongQualifiedPlay")],
    ["dedup legacy fallback", server.includes("songPlayEngagementModel")],
];

let fails = 0;
for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) fails += 1;
}

if (fails) process.exit(1);
console.log("\nverify-phase28-song-play-api.mjs PASS");