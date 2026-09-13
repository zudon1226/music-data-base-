/**
 * Adds player.autoplay* keys to every locale message file (English fallback text).
 * Usage: node scripts/add-player-autoplay-i18n-keys.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(root, "lib/i18n/messages");

const insertion = `            autoplay: "Autoplay",
            autoplayOn: "Autoplay on",
            autoplayOff: "Autoplay off",`;

for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".ts")) continue;
    const path = join(messagesDir, file);
    let text = readFileSync(path, "utf8");
    if (text.includes("autoplayOn:")) continue;
    const marker = "queueCount:";
    const idx = text.indexOf(marker);
    if (idx < 0) {
        console.warn(`skip ${file} — no queueCount marker`);
        continue;
    }
    const lineEnd = text.indexOf("\n", idx);
    if (lineEnd < 0) continue;
    let beforeInsert = text.slice(0, lineEnd + 1);
    if (!beforeInsert.trimEnd().endsWith(",")) {
        beforeInsert = `${text.slice(0, lineEnd)},\n`;
    }
    text = `${beforeInsert}${insertion}\n${text.slice(lineEnd + 1)}`;
    writeFileSync(path, text, "utf8");
    console.log(`updated ${file}`);
}
