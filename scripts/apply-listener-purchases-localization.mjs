/**
 * Applies native listenerPurchases + nav.myPurchases strings to every locale file.
 * Usage: node scripts/apply-listener-purchases-localization.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALE_LISTENER_PURCHASES_COPY } from "./listener-purchases-locale-copy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(root, "lib/i18n/messages");

function escapeTs(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderListenerPurchasesBlock(copy) {
    const lines = [
        "    listenerPurchases: {",
        `        title: "${escapeTs(copy.title)}",`,
        `        kicker: "${escapeTs(copy.kicker)}",`,
        `        subtitle: "${escapeTs(copy.subtitle)}",`,
        `        description: "${escapeTs(copy.description)}",`,
        `        statsLabel: "${escapeTs(copy.statsLabel)}",`,
        `        statOrders: "${escapeTs(copy.statOrders)}",`,
        `        statReceipts: "${escapeTs(copy.statReceipts)}",`,
        `        statLicenses: "${escapeTs(copy.statLicenses)}",`,
        `        statSpend: "${escapeTs(copy.statSpend)}",`,
        `        tabsLabel: "${escapeTs(copy.tabsLabel)}",`,
        `        tabHistory: "${escapeTs(copy.tabHistory)}",`,
        `        tabReceipts: "${escapeTs(copy.tabReceipts)}",`,
        `        tabDownloads: "${escapeTs(copy.tabDownloads)}",`,
        `        tabLicenses: "${escapeTs(copy.tabLicenses)}",`,
        `        tabAccess: "${escapeTs(copy.tabAccess)}",`,
        `        loading: "${escapeTs(copy.loading)}",`,
        `        emptyTitle: "${escapeTs(copy.emptyTitle)}",`,
        `        emptyMessage: "${escapeTs(copy.emptyMessage)}",`,
        `        order: "${escapeTs(copy.order)}",`,
        `        categoryAlbum: "${escapeTs(copy.categoryAlbum)}",`,
        `        categoryBeat: "${escapeTs(copy.categoryBeat)}",`,
        `        categoryRingtone: "${escapeTs(copy.categoryRingtone)}",`,
        `        categorySong: "${escapeTs(copy.categorySong)}",`,
        `        noReceipts: "${escapeTs(copy.noReceipts)}",`,
        `        noDownloads: "${escapeTs(copy.noDownloads)}",`,
        `        noLicenses: "${escapeTs(copy.noLicenses)}",`,
        `        noAccess: "${escapeTs(copy.noAccess)}",`,
        `        signInTitle: "${escapeTs(copy.signInTitle)}",`,
        `        signInBody: "${escapeTs(copy.signInBody)}",`,
        `        signInAction: "${escapeTs(copy.signInAction)}",`,
        "    },",
    ];
    return lines.join("\r\n");
}

for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".ts") || file === "en.ts") continue;
    const locale = file.replace(/\.ts$/, "");
    const copy = LOCALE_LISTENER_PURCHASES_COPY[locale];
    if (!copy) {
        console.warn(`skip ${file} — no copy pack`);
        continue;
    }
    const path = join(messagesDir, file);
    let text = readFileSync(path, "utf8");
    text = text.replace(/\r?\n(\s+)myPurchases: "My Purchases",/, `\r\n$1myPurchases: "${escapeTs(copy.myPurchases)}",`);
    const block = renderListenerPurchasesBlock(copy);
    if (text.includes("listenerPurchases:")) {
        text = text.replace(/    listenerPurchases: \{[\s\S]*?\r?\n    \},/, block);
    } else {
        text = text.replace(/\r?\n    support: \{/, `\r\n${block}\r\n    support: {`);
    }
    writeFileSync(path, text, "utf8");
    console.log(`localized ${file}`);
}

console.log("Listener purchases localization applied.");
