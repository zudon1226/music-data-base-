/**
 * Producer/studio song delete authorization alignment verification.
 * Usage: npm run verify:producer-song-delete-auth
 */
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

function main() {
    const page = read("app/page.tsx");
    const route = read("app/api/songs/[id]/route.ts");

    record("server delete requires owner or platform admin", route.includes("isPlatformOwnerUserId")
        && route.includes("Only the owner can delete this uploaded track.")
        && /song\.user_id !== userId/.test(route));
    record("client delete matches owner-or-admin gate", /function canDeleteUploadedSong\(song: Song\)/.test(page)
        && /song\.ownerId === userId/.test(page)
        && page.includes("Match DELETE /api/songs/:id"));
    record("client delete does not grant credit-only producers", /function canDeleteUploadedSong[\s\S]{0,900}?return Boolean\(userId && song\.ownerId && song\.ownerId === userId\)/.test(page)
        && !/function canDeleteUploadedSong[\s\S]{0,700}producerProfileId:\s*song\.producerId/.test(page));
    record("remove credit uses separate capability", page.includes("canManageSongProducerCredit")
        && /canManageSongProducerCredit\(song\)/.test(page));
    record("execute delete uses authenticated DELETE", page.includes("async function executePermanentSongDelete")
        && /\/api\/songs\/\$\{encodeURIComponent\(songId\)\}/.test(page)
        && /method:\s*"DELETE"/.test(page.slice(page.indexOf("async function executePermanentSongDelete"), page.indexOf("async function executePermanentSongDelete") + 4500))
        && /requireAuth:\s*true/.test(page.slice(page.indexOf("async function executePermanentSongDelete"), page.indexOf("async function executePermanentSongDelete") + 4500)));
    record("unauthorized client path surfaces toast", page.includes('showToast("Only the owner can delete this uploaded track.", "error")'));

    writeFileSync(path.join(evidenceDir, "producer-song-delete-auth-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPRODUCER_SONG_DELETE_AUTH_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
