import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = readFileSync(path.join(root, "lib/song-usage-permissions.ts"), "utf8");
const uploadRoute = readFileSync(path.join(root, "app/api/upload-audio/route.ts"), "utf8");
const songsRoute = readFileSync(path.join(root, "app/api/songs/route.ts"), "utf8");

const checks = [
    ["publication modes exported", usage.includes("SONG_PUBLICATION_MODES")],
    ["requires publication when absent", usage.includes("Select a publication choice")],
    ["draft mode", usage.includes('mode === "draft"') || usage.includes('publicationMode: "draft"')],
    ["public streaming mode", usage.includes("public_streaming")],
    ["default new upload not silent public", usage.includes("streaming_enabled: false")],
    ["upload route uses parseSongUsageFromBody", uploadRoute.includes("parseSongUsageFromBody")],
    ["owner non-public catalog load", songsRoute.includes("loadOwnerNonPublicSongs")],
    ["streaming catalog filter preserved", songsRoute.includes('.eq("streaming_enabled", true)')],
];

let fails = 0;
for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) fails += 1;
}

if (fails) process.exit(1);
console.log("\nverify-phase28-publication.mjs PASS");