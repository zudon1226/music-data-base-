/**
 * Creator Studio upload chrome and mode matrix checks (static).
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
const studio = read("lib/creator-studio.ts");
const chrome = read("components/studio/creator-studio-upload-chrome.tsx");
const en = read("lib/i18n/messages/en.ts");

record("files present", Boolean(studio && chrome && page));
record("producer modes include song", /PRODUCER_STUDIO_UPLOAD_MODES[\s\S]*mode: "song"/.test(studio));
record("producer modes include beat", /PRODUCER_STUDIO_UPLOAD_MODES[\s\S]*mode: "beat"/.test(studio));
record("producer modes include instrumental", /PRODUCER_STUDIO_UPLOAD_MODES[\s\S]*mode: "instrumental"/.test(studio));
record("producer modes include video + album", /mode: "producerVideo"/.test(studio) && /mode: "producerAlbum"/.test(studio));
const artistBlock = studio.match(/export const ARTIST_STUDIO_UPLOAD_MODES[\s\S]*?\];/)?.[0] || "";
record("artist modes song/video/album only", artistBlock.includes('mode: "song"')
    && artistBlock.includes('mode: "video"')
    && artistBlock.includes('mode: "album"')
    && !artistBlock.includes('mode: "beat"')
    && !artistBlock.includes('mode: "instrumental"'));
record("page preserves beat upload handler", page.includes("addUploadedProducerBeat") && page.includes("saveProducerBeatMetadata"));
record("page preserves song upload handler", page.includes("addUploadedSong") && page.includes("uploadAudioToSupabase"));
record("instrumental reuses beat pipeline", page.includes('uploadMode === "instrumental"')
    && page.includes("isBeatLikeUploadMode(uploadMode)"));
record("producer song auto credit", page.includes('creatorStudio === "producer"')
    && page.includes("producerCreditId = profile.id"));
record("studio headers on dashboards", page.includes('t("upload.producerStudio")') && page.includes('t("upload.artistStudio")'));
record("chrome shows distinct studio titles", chrome.includes("upload.producerStudio") && chrome.includes("upload.artistStudio"));
record("dual-role switcher present", chrome.includes("creator-studio-switcher"));
record("touch targets 44px", page.includes(".creator-studio-switcher button") && page.includes("min-height: 44px"));
record("player clearance on upload shell", page.includes("padding-bottom: calc(var(--mobile-player-reserve"));
record("i18n studio keys", en.includes("producerStudio:") && en.includes("uploadBeat:") && en.includes("uploadInstrumental:"));
record("upload lock and role gates preserved", page.includes("shouldShowUploadControl(desktopNavAccess)")
    && page.includes("uploadsBlockedForCurrentUser"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nCREATOR_STUDIO_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
