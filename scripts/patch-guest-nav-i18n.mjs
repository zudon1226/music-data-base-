import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "lib/i18n/messages");
const insert = `        music: "Music",
        ringtones: "Ringtones",
        betaBrowseOnly: "Beta",
        ringtonesBetaPurchasesLocked: "Browse and preview only. Purchases unlock at full launch.",
`;
let patched = 0;
let skipped = 0;

for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts") || file === "en.ts") continue;
    const filePath = path.join(dir, file);
    let source = fs.readFileSync(filePath, "utf8");
    if (source.includes("betaBrowseOnly:")) {
        continue;
    }
    const pattern = /(\r?\n\s*home:\s*"[^"]*",\r?\n)(\s*marketplace:)/;
    const match = source.match(pattern);
    if (!match) {
        console.error(`skip ${file}`);
        skipped += 1;
        continue;
    }
    source = source.replace(pattern, `${match[1]}${insert}${match[2]}`);
    fs.writeFileSync(filePath, source);
    patched += 1;
}

console.log(`patched ${patched}, skipped ${skipped}`);
if (skipped > 0) process.exit(1);