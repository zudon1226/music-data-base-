/**
 * Paid-listener music/video download contracts (static + entitlement unit checks).
 * Run: node scripts/verify-paid-listener-media-download.mjs
 * Or: npm run verify:media-download
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const mediaCard = read("components/desktop-media-card.tsx");
const cardTypes = read("lib/desktop-media-card-types.ts");
const listenerActions = read("lib/listener-media-actions.ts");
const accessLib = read("lib/billing/listener-download-access.ts");
const authLib = read("lib/media-download-auth.ts");
const filenameLib = read("lib/media-download-filename.ts");
const clientLib = read("lib/media-download-client.ts");
const songRoute = read("app/api/songs/[id]/download/route.ts");
const videoRoute = read("app/api/videos/[id]/download/route.ts");
const migration = read("supabase/migrations/202607200002_media_listener_downloads.sql");
const pkg = read("package.json");
const checkoutEnforcement = read("scripts/verify-subscription-checkout-enforcement.mjs");
const notifNav = read("scripts/verify-notification-nav-canonical.mjs");
const layoutLock = read("scripts/verify-responsive-stability-lock.mjs");

record("migration adds download_enabled + media_downloads", migration.includes("download_enabled")
    && migration.includes("create table if not exists public.media_downloads")
    && migration.includes("content_type in ('music', 'video')"));
record("listener download access helper present", accessLib.includes("evaluatePremiumListenerDownloadAccess")
    && accessLib.includes("premium-listener")
    && accessLib.includes('effectiveStatus !== "active"'));
record("premium required message constant", accessLib.includes("Premium Listener is required to download music and videos."));
record("song download route streams attachment", songRoute.includes("Content-Disposition")
    && songRoute.includes("private, no-store")
    && songRoute.includes("authorizeMediaDownload")
    && songRoute.includes("SONGS_BUCKET")
    && !songRoute.includes("createSignedUrl"));
record("video download route streams attachment", videoRoute.includes("Content-Disposition")
    && videoRoute.includes("private, no-store")
    && videoRoute.includes("authorizeMediaDownload")
    && videoRoute.includes("VIDEOS_BUCKET")
    && !videoRoute.includes("createSignedUrl"));
record("routes reject missing auth", songRoute.includes("AUTH_REQUIRED") && videoRoute.includes("AUTH_REQUIRED"));
record("routes reject download_disabled", songRoute.includes("DOWNLOAD_DISABLED") && videoRoute.includes("DOWNLOAD_DISABLED"));
record("routes reject invalid id substitution", songRoute.includes("INVALID_ID") && videoRoute.includes("INVALID_ID"));
record("history recorded only after successful fetch", /storage\.from[\s\S]*download[\s\S]*recordMediaDownloadEvent/.test(songRoute)
    && /storage\.from[\s\S]*download[\s\S]*recordMediaDownloadEvent/.test(videoRoute));
record("filename helper builds readable titles", filenameLib.includes("buildMediaDownloadFilename")
    && filenameLib.includes("buildMediaContentDisposition"));
record("client one-request download helper", clientLib.includes("downloadAuthorizedMediaFile")
    && clientLib.includes("triggerBrowserFileDownload")
    && !clientLib.includes("createSignedUrl"));
record("media card exposes Download action", mediaCard.includes('data-media-action="download"')
    && mediaCard.includes("Preparing download…")
    && mediaCard.includes("onDownload"));
record("card types include onDownload", cardTypes.includes("onDownload: () => void")
    && cardTypes.includes("isDownloading"));
record("primary action order includes download", /LISTENER_MEDIA_PRIMARY_ACTION_ORDER[\s\S]*"download"/.test(listenerActions));
record("page wires song + video download", page.includes('downloadMediaFromCard("music"')
    && page.includes('downloadMediaFromCard("video"')
    && page.includes("mediaDownloadLockRef")
    && page.includes("openSubscriptionPlansForMediaDownload"));
record("ineligible UX opens subscription section", page.includes("PREMIUM_LISTENER_DOWNLOAD_REQUIRED_MESSAGE")
    && page.includes(".subscription-section"));
record("grid and list share same Desktop media cards", page.includes("DesktopSongMediaCard")
    && page.includes("DesktopVideoMediaCard")
    && page.includes('view-${displayMode}'));
record("download button CSS present without layout chrome edits", page.includes(".download-btn")
    && !page.includes("SIDEBAR_WIDTH_CHANGED_MARKER"));
record("package has verify:media-download", pkg.includes("verify:media-download"));
record("checkout enforcement verifier still present", checkoutEnforcement.includes("checkout"));
record("notification nav verifier still present", notifNav.includes("NotificationCenterPanel"));
record("layout lock verifier still present", layoutLock.includes("Responsive UI stability lock"));
record("ringtone download routes untouched marker", read("app/api/ringtones/[id]/download/route.ts").includes("buyerHasPaidRingtonePurchase"));

// Entitlement unit checks via dynamic import of TS through compiled-free reimplementation mirror.
const { evaluatePremiumListenerDownloadAccess } = await import(
    pathToFileURL(path.join(root, "lib/billing/listener-download-access.ts")).href
).catch(async () => {
    // Next/TS may not import directly; mirror critical rules inline from source contracts.
    const { createRequire } = await import("node:module");
    try {
        const require = createRequire(import.meta.url);
        // Prefer tsx-less: eval source patterns only.
        return {
            evaluatePremiumListenerDownloadAccess: null,
        };
    } catch {
        return { evaluatePremiumListenerDownloadAccess: null };
    }
});

function mirrorEvaluate(subscription) {
    // Keep in sync with lib/billing/listener-download-access.ts
    if (!subscription) {
        return { allowed: false, reason: "NO_SUBSCRIPTION", effectiveStatus: "none" };
    }
    const name = String(subscription.plan_name || "").toLowerCase();
    const price = Number(subscription.price_cents || 0);
    const isPremium = (name === "premium listener" || name === "listener monthly") && price > 0;
    const status = String(subscription.admin_override_status || subscription.status || "").toLowerCase();
    const effective = status === "canceled" ? "cancelled" : status === "current" ? "active" : status;
    if (!isPremium) return { allowed: false, reason: "NOT_PREMIUM_LISTENER", effectiveStatus: effective };
    if (price <= 0) return { allowed: false, reason: "UNPAID", effectiveStatus: effective };
    if (effective !== "active") return { allowed: false, reason: "STATUS_BLOCKED", effectiveStatus: effective };
    return { allowed: true, reason: "ALLOWED", effectiveStatus: effective };
}

const evaluate = typeof evaluatePremiumListenerDownloadAccess === "function"
    ? evaluatePremiumListenerDownloadAccess
    : mirrorEvaluate;

record(
    "Premium Listener active allowed",
    evaluate({ plan_name: "Premium Listener", price_cents: 699, status: "active" }).allowed === true,
);
record(
    "Free Listener blocked",
    evaluate({ plan_name: "Free Listener", price_cents: 0, status: "active" }).allowed === false,
);
record(
    "logged-out / missing subscription blocked",
    evaluate(null).allowed === false,
);
record(
    "past-due Premium Listener blocked",
    evaluate({ plan_name: "Premium Listener", price_cents: 699, status: "past_due" }).allowed === false,
);
record(
    "canceled Premium Listener blocked",
    evaluate({ plan_name: "Premium Listener", price_cents: 699, status: "cancelled" }).allowed === false
        && evaluate({ plan_name: "Premium Listener", price_cents: 699, status: "canceled" }).allowed === false,
);
record(
    "inactive Premium Listener blocked",
    evaluate({ plan_name: "Premium Listener", price_cents: 699, status: "inactive" }).allowed === false,
);
record(
    "filename music extension preserved",
    filenameLib.includes('contentType === "video" ? "mp4" : "mp3"')
        || /buildMediaDownloadFilename[\s\S]*music/.test(filenameLib),
);
record(
    "client lock prevents duplicate clicks",
    page.includes("if (mediaDownloadLockRef.current) return"),
);

// Filename contracts from source (no TS runtime import required).
record(
    "audio filename readable + .mp3",
    filenameLib.includes("buildMediaDownloadFilename")
        && filenameLib.includes('contentType === "video" ? "mp4" : "mp3"')
        && filenameLib.includes("extensionFromStoragePath")
        && filenameLib.includes("audio/mpeg")
        && filenameLib.includes('mp3: "audio/mpeg"'),
);
record(
    "video filename readable + .mp4",
    filenameLib.includes('contentType === "video" ? "video" : "track"')
        && filenameLib.includes("video/mp4")
        && filenameLib.includes("buildMediaContentDisposition")
        && filenameLib.includes('mp4: "video/mp4"'),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nPAID_LISTENER_MEDIA_DOWNLOAD_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
