/**
 * Adds the English support.* block to every locale message file (English text fallback).
 * Usage: node scripts/add-support-i18n-keys.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = join(root, "lib/i18n/messages");

const supportBlock = `    support: {
        title: "Report a Problem / Beta Feedback",
        subtitle: "Tell us what went wrong or share beta feedback. We attach safe diagnostics only — never passwords, tokens, or payment details.",
        open: "Open",
        hide: "Hide",
        category: "Category",
        subject: "Subject",
        description: "Description",
        screenshotOptional: "Screenshot (optional, PNG/JPG/WEBP)",
        submit: "Submit feedback",
        submitSuccess: "Thank you. Your report was submitted.",
        submitFailed: "Could not submit your report.",
        loadFailed: "Could not load your support tickets.",
        signInRequired: "Sign in to submit support feedback.",
        ticketNumber: "Ticket number",
        yourTickets: "Your tickets",
        noTickets: "You have not submitted any support tickets yet.",
        viewScreenshot: "View screenshot",
        screenshotFailed: "Could not open the screenshot.",
        categoryUpload: "Upload problem",
        categoryPlayback: "Playback problem",
        categoryAccount: "Login / Account",
        categoryPodcast: "Podcast",
        categoryRingtone: "Ringtone",
        categoryBilling: "Subscription / Billing",
        categoryNavigation: "Navigation / Layout",
        categoryBug: "General bug",
        categorySuggestion: "Suggestion / Feedback",
        categoryOther: "Other",
        statusNew: "New",
        statusReviewing: "Reviewing",
        statusNeedMoreInfo: "Need More Info",
        statusFixed: "Fixed",
        statusClosed: "Closed",
        reportFromUpload: "Report this upload problem",
        adminTitle: "Beta Feedback / Support",
        adminQueueCount: "tickets",
        adminLoadFailed: "Could not load the support queue.",
        adminSaveFailed: "Could not save ticket updates.",
        adminEmpty: "No support tickets match these filters.",
        adminStatus: "Status",
        adminSeverity: "Severity",
        adminNotes: "Internal admin notes",
        adminSave: "Save ticket",
        filterStatus: "All statuses",
        filterCategory: "All categories",
        filterAccountType: "Account type",
        filterDeviceType: "Device type",
        filterSeverity: "All severities",
        diagCategory: "Category",
        diagAccount: "Account type",
        diagPage: "Page",
        diagDevice: "Device",
        diagBrowser: "Browser",
        diagUpload: "Upload type",
        diagFile: "File",
        diagStage: "Upload stage",
        diagErrorCode: "Error code",
        diagRequestId: "Request ID",
        diagSubmitted: "Submitted",
    },`;

for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".ts") || file === "en.ts") continue;
    const path = join(messagesDir, file);
    let text = readFileSync(path, "utf8");
    if (text.includes("support:")) continue;
    const marker = "\n};";
    const idx = text.lastIndexOf(marker);
    if (idx === -1) {
        console.warn(`Skip ${file}: could not find closing };`);
        continue;
    }
    text = `${text.slice(0, idx)},\n${supportBlock}\n${text.slice(idx)}`;
    writeFileSync(path, text, "utf8");
    console.log(`Patched ${file}`);
}

console.log("Support i18n keys added where missing.");
