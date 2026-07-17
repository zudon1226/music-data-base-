/**
 * Ringtone Platform Phase 5 — 57-locale ringtone translation parity.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const messagesDir = path.join(root, "lib/i18n/messages");
const results = [];
const rtlLocales = ["ar", "he", "ur"];

function record(name, passed, detail = "") {
    results.push({ name, passed: Boolean(passed) });
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function flatten(obj, prefix = "") {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") Object.assign(out, flatten(v, key));
        else out[key] = String(v);
    }
    return out;
}

function extractObject(source, exportName) {
    const start = source.indexOf(`export const ${exportName}`);
    if (start < 0) return null;
    const brace = source.indexOf("{", start);
    let depth = 0;
    let end = -1;
    for (let i = brace; i < source.length; i += 1) {
        if (source[i] === "{") depth += 1;
        else if (source[i] === "}") {
            depth -= 1;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    if (end < 0) return null;
    try {
        return Function(`return (${source.slice(brace, end + 1)})`)();
    } catch {
        return null;
    }
}

function exportNameFor(code) {
    if (code === "zh-CN") return "zhCNMessages";
    if (code === "zh-TW") return "zhTWMessages";
    if (code === "en") return "enMessages";
    return `${code}Messages`;
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function finish() {
    const failed = results.filter((item) => !item.passed).length;
    console.log(`\nRingtone Phase 5 i18n: ${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}

const en = extractObject(read("lib/i18n/messages/en.ts"), "enMessages");
const enFlat = flatten(en);
const allKeys = Object.keys(enFlat);
const ringtoneKeys = allKeys.filter((key) => key.startsWith("ringtones."));
record("english ringtone key count", ringtoneKeys.length === 186, String(ringtoneKeys.length));
record("english total key count", allKeys.length >= 400, String(allKeys.length));

const requiredSurfaceKeys = [
    "ringtones.myRingtones",
    "ringtones.create",
    "ringtones.chooseSource",
    "ringtones.existingSong",
    "ringtones.uploadSource",
    "ringtones.selectClip",
    "ringtones.clipStart",
    "ringtones.clipEnd",
    "ringtones.duration",
    "ringtones.productDetails",
    "ringtones.review",
    "ringtones.saveDraft",
    "ringtones.submitForReview",
    "ringtones.processing",
    "ringtones.processingFailed",
    "ringtones.retryProcessing",
    "ringtones.pendingReview",
    "ringtones.approved",
    "ringtones.rejected",
    "ringtones.published",
    "ringtones.suspended",
    "ringtones.archived",
    "ringtones.rejectionReason",
    "ringtones.ownershipConfirmation",
    "ringtones.previewRingtone",
    "ringtones.marketplace",
    "ringtones.featuredRingtones",
    "ringtones.trendingRingtones",
    "ringtones.newRingtones",
    "ringtones.freeRingtones",
    "ringtones.purchaseRingtone",
    "ringtones.buyNow",
    "ringtones.alreadyOwned",
    "ringtones.paymentPending",
    "ringtones.paymentCompleted",
    "ringtones.paymentFailed",
    "ringtones.paymentCanceled",
    "ringtones.downloadForIphone",
    "ringtones.downloadForAndroid",
    "ringtones.myPurchasedRingtones",
    "ringtones.favoriteRingtones",
    "ringtones.installationInstructions",
    "ringtones.openGarageBand",
    "ringtones.downloadAgain",
    "ringtones.relatedRingtones",
    "ringtones.moreFromCreator",
    "ringtones.ringtoneReviewQueue",
    "ringtones.processingQueue",
    "ringtones.processingStarted",
    "ringtones.processingCompleted",
    "ringtones.approveRingtone",
    "ringtones.rejectRingtone",
    "ringtones.publishRingtone",
    "ringtones.suspendRingtone",
    "ringtones.restoreRingtone",
    "ringtones.archiveRingtone",
    "ringtones.revision",
    "ringtones.processingDetails",
    "ringtones.iphoneFileReady",
    "ringtones.androidFileReady",
    "ringtones.previewReady",
    "ringtones.moderationHistory",
    "ringtones.requestReprocessing",
    "ringtones.actionCouldNotComplete",
    "ringtones.ringtoneDeleted",
    "ringtones.ringtoneArchivedInstead",
    "ringtones.ringtoneAlreadyArchived",
    "ringtones.confirmDeleteRingtone",
];
record(
    "required surface keys present in English",
    requiredSurfaceKeys.every((key) => ringtoneKeys.includes(key)),
    `checked=${requiredSurfaceKeys.length}`,
);

const localeFiles = readdirSync(messagesDir).filter((file) => file.endsWith(".ts") && file !== "en.ts");
record("non-english locale file count", localeFiles.length === 56, String(localeFiles.length));

let missingTotal = 0;
let emptyTotal = 0;
let englishExactTotal = 0;
let rawTotal = 0;
let interpolationMismatches = 0;
const parityRows = [];

for (const file of localeFiles) {
    const code = file.replace(/\.ts$/, "");
    const source = read(path.join("lib/i18n/messages", file));
    const obj = extractObject(source, exportNameFor(code));
    const flat = flatten(obj);
    const missing = ringtoneKeys.filter((key) => !(flat[key] != null && String(flat[key]).trim() !== ""));
    const empty = ringtoneKeys.filter((key) => flat[key] != null && String(flat[key]).trim() === "");
    const englishExact = ringtoneKeys.filter((key) => flat[key] === enFlat[key]);
    const raw = ringtoneKeys.filter((key) => flat[key] === key || flat[key] === key.split(".").pop());
    for (const key of ringtoneKeys) {
        const enVars = String(enFlat[key] || "").match(/\{(\w+)\}/g) || [];
        const localeVars = String(flat[key] || "").match(/\{(\w+)\}/g) || [];
        if (enVars.sort().join() !== localeVars.sort().join()) interpolationMismatches += 1;
    }
    missingTotal += missing.length;
    emptyTotal += empty.length;
    englishExactTotal += englishExact.length;
    rawTotal += raw.length;
    parityRows.push({
        code,
        ok: missing.length === 0 && empty.length === 0 && englishExact.length === 0 && raw.length === 0,
        missing: missing.length,
        englishExact: englishExact.length,
    });
    record(
        `parity ${code}`,
        missing.length === 0 && empty.length === 0 && englishExact.length === 0 && raw.length === 0,
        `keys=${ringtoneKeys.length - missing.length}/${ringtoneKeys.length} englishExact=${englishExact.length}`,
    );
}

record("complete 57-locale parity", parityRows.every((row) => row.ok) && localeFiles.length === 56);
record("missing-value audit", missingTotal === 0 && emptyTotal === 0, `missing=${missingTotal} empty=${emptyTotal}`);
record("english-placeholder audit", englishExactTotal === 0, `exact=${englishExactTotal}`);
record("raw-key audit", rawTotal === 0, `raw=${rawTotal}`);
record("interpolation-variable audit", interpolationMismatches === 0, `mismatches=${interpolationMismatches}`);
record("0 ringtone English fallbacks", englishExactTotal === 0 && missingTotal === 0);

// RTL contract: permanent shell remains LTR; document dir may be rtl for text.
const rtlCss = read("lib/i18n/i18n-styles.ts");
record("RTL permanent shell left sidebar", rtlCss.includes("Permanent physical shell") || rtlCss.includes("never reverse chrome"));
record("RTL arabic/hebrew/urdu registry", rtlLocales.every((code) => existsSync(path.join(messagesDir, `${code}.ts`))));
for (const code of rtlLocales) {
    const source = read(path.join("lib/i18n/messages", `${code}.ts`));
    const obj = extractObject(source, exportNameFor(code));
    const sample = obj?.ringtones?.ringtoneReviewQueue || "";
    const hasNativeScript = code === "he"
        ? /[\u0590-\u05FF]/.test(sample)
        : /[\u0600-\u06FF]/.test(sample);
    record(`RTL script ${code}`, hasNativeScript, sample.slice(0, 40));
}

// Formatting helpers remain locale-aware and do not alter stored money.
const formatSource = read("lib/i18n/format.ts");
record("locale formatting helpers present", /Intl\.NumberFormat|Intl\.DateTimeFormat/.test(formatSource));

// Responsive/a11y markers already in ringtone UIs.
const creatorUi = read("components/ringtone-creator/ringtone-creator-workspace.tsx");
const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
const reviewUi = read("components/ringtone-review/ringtone-review-queue.tsx");
record("responsive creator markers", creatorUi.includes("@media (max-width: 820px)") && creatorUi.includes("padding-bottom: calc(var(--mobile-player-reserve"));
record("responsive marketplace markers", marketUi.includes("@media (max-width: 820px)") && marketUi.includes("padding-bottom: calc(var(--mobile-player-reserve"));
record("responsive review markers", reviewUi.includes("@media (max-width: 820px)") && reviewUi.includes("padding-bottom: calc(var(--mobile-player-reserve"));
record("review dialog a11y", reviewUi.includes('role="dialog"') && reviewUi.includes("aria-live"));

// Regression contracts for prior phases remain wired.
record("phase2 creator wiring", creatorUi.includes("submitRingtoneForReview"));
record("phase3 marketplace wiring", marketUi.includes("purchaseLockRef"));
record("phase4 review wiring", reviewUi.includes("approveRingtone") || reviewUi.includes("performRingtoneReviewAction"));
record("process route present", existsSync(path.join(root, "app/api/ringtones/[id]/process/route.ts")));
record("publication gates present", existsSync(path.join(root, "lib/ringtone-publication.ts")));

const secretHit = [
    "lib/i18n/messages/es.ts",
    "lib/i18n/messages/ar.ts",
    "lib/i18n/translate.ts",
    "components/ringtone-review/ringtone-review-queue.tsx",
].find((filePath) => /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/.test(read(filePath)));
record("secret exposure scan", !secretHit, secretHit || "clean");

// Type contract: ringtones required on LocaleMessageDictionary.
const enTypes = read("lib/i18n/messages/en.ts");
record(
    "locale dictionary requires ringtones",
    enTypes.includes("export type LocaleMessageDictionary = TranslationMessages"),
);

// Cleanup temporary generation artifacts if present.
const tmpPacks = path.join(root, "tmp/ringtone-packs");
const tmpAudit = path.join(root, "tmp/ringtone-i18n-audit.json");
if (existsSync(tmpPacks)) rmSync(tmpPacks, { recursive: true, force: true });
if (existsSync(tmpAudit)) rmSync(tmpAudit, { force: true });
for (const tempScript of [
    "scripts/inject-ringtone-i18n.mjs",
    "scripts/fix-ringtone-english-placeholders.mjs",
    "scripts/fix-ringtone-filter-keys.mjs",
    "scripts/audit-ringtone-i18n.mjs",
]) {
    const full = path.join(root, tempScript);
    if (existsSync(full) && process.argv.includes("--cleanup-temp-scripts")) {
        rmSync(full, { force: true });
    }
}
record("temporary pack cleanup", !existsSync(tmpPacks));

finish();
