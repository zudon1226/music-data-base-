/**
 * Add to Playlist modal must close/reset on navigation.
 * Run: node scripts/verify-add-to-playlist-modal-closes-on-nav.mjs
 * Or: npm run verify:add-to-playlist-modal-closes-on-nav
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
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
const pkg = read("package.json");

record(
    "playlistTarget state still owns Add to Playlist modal",
    page.includes("const [playlistTarget, setPlaylistTarget]")
        && page.includes("playlist-modal-backdrop")
        && page.includes("Add to playlist"),
);

record(
    "closeAddToPlaylistModal resets playlistTarget to null",
    page.includes("function closeAddToPlaylistModal")
        && /function closeAddToPlaylistModal\(\)\s*\{\s*setPlaylistTarget\(null\);\s*\}/.test(page),
);

record(
    "closes on activeNavigationKey change (sidebar/workspace)",
    page.includes("playlistModalNavigationKeyRef")
        && page.includes("setPlaylistTarget(null)")
        && /playlistModalNavigationKeyRef\.current !== activeNavigationKey|playlistModalNavigationKeyRef\.current === activeNavigationKey/.test(page)
        && /}, \[activeNavigationKey\]\);/.test(page),
);

record(
    "closes on Next.js pathname change",
    page.includes('from "next/navigation"')
        && page.includes("usePathname")
        && /const pathname = usePathname\(\)/.test(page)
        && /useEffect\(\(\) => \{\s*setPlaylistTarget\(null\);\s*\}, \[pathname\]\);/.test(page.replace(/\r\n/g, "\n")),
);

record(
    "closes on popstate and hashchange (Back/Forward)",
    page.includes('window.addEventListener("popstate"')
        && page.includes('window.addEventListener("hashchange"')
        && page.includes('window.removeEventListener("popstate"')
        && page.includes('window.removeEventListener("hashchange"'),
);

record(
    "Escape closes open modal",
    /event\.key !== "Escape"|event\.key === "Escape"/.test(page)
        && /playlistTarget[\s\S]{0,400}Escape/.test(page)
        && page.includes("window.addEventListener(\"keydown\""),
);

record(
    "overlay and X still close via closeAddToPlaylistModal",
    page.includes("onClick={closeAddToPlaylistModal}")
        && (page.match(/onClick=\{closeAddToPlaylistModal\}/g) || []).length >= 2,
);

record(
    "closes when selected media disappears",
    page.includes('playlistTarget.type === "song"')
        && page.includes("!songs.some(")
        && page.includes("!videos.some(")
        && page.includes("!albums.some(")
        && /}, \[playlistTarget, songs, videos, albums\]\);/.test(page),
);

record(
    "does not close solely via sidebar-handler-only pattern",
    page.includes("activeNavigationKey")
        && page.includes("usePathname")
        && page.includes("popstate"),
);

record(
    "package exposes verifier script",
    pkg.includes("verify:add-to-playlist-modal-closes-on-nav"),
);

writeFileSync(
    path.join(evidenceDir, "add-to-playlist-modal-closes-on-nav-evidence.json"),
    JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nADD_TO_PLAYLIST_MODAL_CLOSES_ON_NAV_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
