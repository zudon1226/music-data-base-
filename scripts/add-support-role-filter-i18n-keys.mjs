/**
 * Adds support.filterRole* keys to every locale message file (English fallback text).
 * Usage: node scripts/add-support-role-filter-i18n-keys.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(root, "lib/i18n/messages");

const insertion = `        filterRoleAll: "All",
        filterRoleListener: "Listener",
        filterRoleArtist: "Artist",
        filterRoleProducer: "Producer",`;

for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".ts")) continue;
    const path = join(messagesDir, file);
    let text = readFileSync(path, "utf8");
    if (text.includes("filterRoleAll:")) continue;
    const marker = "filterAccountType:";
    const idx = text.indexOf(marker);
    if (idx < 0) {
        console.warn(`skip ${file} — no filterAccountType marker`);
        continue;
    }
    const lineEnd = text.indexOf("\n", idx);
    if (lineEnd < 0) continue;
    text = `${text.slice(0, lineEnd + 1)}${insertion}\n${text.slice(lineEnd + 1)}`;
    writeFileSync(path, text, "utf8");
    console.log(`updated ${file}`);
}
