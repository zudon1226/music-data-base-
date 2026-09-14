/**
 * Adds accountDeletion.* keys to every locale message file (English fallback text).
 * Usage: node scripts/add-account-deletion-i18n-keys.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(root, "lib/i18n/messages");

const block = `    accountDeletion: {
        deleteAccount: "Delete Account",
        warningTitle: "Delete Account Warning",
        warningBody: "Deleting your account is permanent. Music Data Base will remove or anonymize your data that we are not legally required to retain, including profile details, preferences, library activity, uploads you own, and support attachments.",
        permanentNotice: "Deleting your account is permanent.",
        understandPermanent: "I understand this action cannot be undone.",
        confirmDeletion: "Confirm Deletion",
        typeDeletePrompt: "Type DELETE to confirm this permanent action.",
        confirmPlaceholder: "DELETE",
        deleting: "Deleting account...",
        deleted: "Your account has been deleted.",
        failed: "Could not delete your account. Try again or contact support.",
        ownerBlocked: "This owner account cannot be deleted from the profile screen.",
    },`;

for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".ts") || file === "en.ts") continue;
    const path = join(messagesDir, file);
    let text = readFileSync(path, "utf8");
    if (text.includes("accountDeletion:")) continue;
    const marker = "settings:";
    const idx = text.indexOf(marker);
    if (idx < 0) {
        console.warn(`skip ${file} — no settings marker`);
        continue;
    }
    const settingsClose = text.indexOf("},", idx);
    if (settingsClose < 0) {
        console.warn(`skip ${file} — could not find settings block end`);
        continue;
    }
    const insertAt = settingsClose + 3;
    text = `${text.slice(0, insertAt)}\n${block}\n${text.slice(insertAt)}`;
    writeFileSync(path, text, "utf8");
    console.log(`updated ${file}`);
}
