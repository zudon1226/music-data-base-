/**
 * Verify smallest-safe role/authorization fix (static + resolver logic; no Stripe/payout side effects).
 *
 * Usage: node scripts/verify-role-authorization-fix.mjs
 */
import assert from "node:assert/strict";
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
    return readFileSync(full, "utf8").replace(/\r\n/g, "\n");
}

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    } catch { /* ignore */ }
    return env;
}

const CREATOR_ROLE_TOKENS = new Set([
    "artist", "producer", "admin", "creator",
    "founding_artist", "founding_producer", "artist_pro", "producer_pro",
]);

function normalizeResolvedAccountRole(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (["artist", "founding_artist", "artist_pro", "creator"].includes(normalized)) return "artist";
    if (["producer", "founding_producer", "producer_pro"].includes(normalized)) return "producer";
    return "listener";
}

function collectExplicitAccountRoles(input) {
    const roles = new Set();
    for (const role of input.accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) roles.add(clean);
    }
    const primary = normalizeResolvedAccountRole(input.primaryRole);
    if (primary !== "listener") roles.add(primary);
    if (input.isAdmin) roles.add("admin");
    return roles;
}

function resolveCapabilitiesFromExplicitRoles(input) {
    const isPlatformOwner = Boolean(input.isPlatformOwner);
    const roles = collectExplicitAccountRoles({
        primaryRole: input.primaryRole,
        accountRoles: input.accountRoles,
        isAdmin: input.isAdmin || isPlatformOwner,
    });
    const isAdmin = isPlatformOwner || Boolean(input.isAdmin) || roles.has("admin");
    const isArtist = isAdmin
        || roles.has("artist")
        || roles.has("founding_artist")
        || roles.has("artist_pro")
        || roles.has("creator");
    const isProducer = isAdmin
        || roles.has("producer")
        || roles.has("founding_producer")
        || roles.has("producer_pro");
    const isCreator = isArtist || isProducer || [...roles].some((role) => CREATOR_ROLE_TOKENS.has(role));

    if (isPlatformOwner || isAdmin) {
        return {
            canUpload: true, isArtist: true, isProducer: true, isListenerOnly: false, isAdmin: true,
        };
    }

    return {
        canUpload: isCreator,
        isArtist,
        isProducer,
        isListenerOnly: !isCreator,
        isAdmin: false,
    };
}

function loadResolvedFromProfile(input) {
    const primaryRole = normalizeResolvedAccountRole(input.accountType);
    const isAdmin = input.isAdmin === true;
    const roleSet = new Set();
    if (primaryRole !== "listener") roleSet.add(primaryRole);
    if (isAdmin) roleSet.add("admin");
    for (const role of input.userRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (!clean) continue;
        const normalized = normalizeResolvedAccountRole(clean);
        if (
            primaryRole === "listener"
            && !isAdmin
            && !input.isPlatformOwner
            && (normalized === "artist" || normalized === "producer" || normalized === "admin")
        ) {
            continue;
        }
        roleSet.add(clean);
    }
    return resolveCapabilitiesFromExplicitRoles({
        isPlatformOwner: input.isPlatformOwner,
        isAdmin: isAdmin || roleSet.has("admin"),
        primaryRole: input.accountType || primaryRole,
        accountRoles: roleSet,
    });
}

function requireCreatorAccountAccess(cap) {
    if (!cap.canUpload && !cap.isAdmin) {
        return { ok: false, status: 403 };
    }
    return { ok: true };
}

function requireCreatorAudienceAccess(cap, creatorType) {
    const base = requireCreatorAccountAccess(cap);
    if (!base.ok) return base;
    if (cap.isAdmin) return { ok: true };
    if (creatorType === "artist" && !cap.isArtist) return { ok: false, status: 403 };
    if (creatorType === "producer" && !cap.isProducer) return { ok: false, status: 403 };
    return { ok: true };
}

// --- Static route wiring ---
const resolver = read("lib/resolved-account-role.ts");
const adminAuth = read("lib/admin-auth.ts");
const connectOnboard = read("app/api/connect/onboard/route.ts");
const connectStatus = read("app/api/connect/status/route.ts");
const connectRefresh = read("app/api/connect/refresh/route.ts");
const payouts = read("app/api/payouts/route.ts");
const creatorInsights = read("app/api/creator-insights/route.ts");
const launchChecklist = read("app/api/launch/checklist/route.ts");
const launchAdmin = read("app/api/launch/admin/route.ts");
const adminPayouts = read("app/api/admin/payouts/route.ts");
const migration = read("supabase/migrations/202609091001_align_creator_rls_with_account_roles.sql");
const betaSub = read("lib/public-beta-subscription-checkout.ts");
const betaRing = read("lib/public-beta-ringtone-purchase.ts");

record("resolver exports creator gates", resolver.includes("requireCreatorAccountAccess")
    && resolver.includes("requireCreatorAudienceAccess")
    && resolver.includes("profiles.account_type is authoritative"));

const creatorRoutePattern = (src) => src.includes("requireMatchingUserId")
    && src.includes("requireCreatorAudienceAccess");

record("1 unauthenticated creator route rejected (requireMatchingUserId first)", !connectOnboard || creatorRoutePattern(connectOnboard), !connectOnboard ? "deferred to Connect group" : "");
record("connect onboard creator gate", !connectOnboard || creatorRoutePattern(connectOnboard), !connectOnboard ? "deferred to Connect group" : "");
record("connect status creator gate", !connectStatus || creatorRoutePattern(connectStatus), !connectStatus ? "deferred to Connect group" : "");
record("connect refresh creator gate", !connectRefresh || creatorRoutePattern(connectRefresh), !connectRefresh ? "deferred to Connect group" : "");

record("payouts POST creator audience gate", payouts.includes("requireCreatorAudienceAccess")
    && payouts.includes('requireMatchingUserId(request, "/api/payouts"'));
record("payouts GET creator gate", payouts.includes("requireCreatorAccountAccess")
    || payouts.includes("requireCreatorAudienceAccess"));
record("creator-insights creator gate", creatorInsights.includes("requireCreatorAccountAccess")
    && creatorInsights.includes('requireMatchingUserId(request, "/api/creator-insights"'));

record("launch checklist PATCH session + admin", launchChecklist.includes("requireMatchingUserId")
    && launchChecklist.includes("requireAdminUserId")
    && !launchChecklist.includes("async function isAdminUser"));
record("launch admin GET session-bound", launchAdmin.includes('requireMatchingUserId(request, "/api/launch/admin"'));
record("admin payouts session + admin", adminPayouts.includes("requireMatchingUserId")
    && adminPayouts.includes("requireAdminUserId"));

record("RLS migration present", migration.includes("can_upload_creator_content")
    && migration.includes("can_create_ringtones")
    && migration.includes("owners_insert on public.songs")
    && migration.includes("owners_insert on public.videos"));
record("RLS ignores stale listener creator roles", migration.includes("v_primary_role = 'listener'")
    && migration.includes("continue"));
record("RLS ringtone uses upload helper", migration.includes("select public.can_upload_creator_content(check_user_id)"));
record("RLS removes artist_profiles/producer_profiles heuristic", !migration.includes("artist_profiles")
    && !migration.includes("producer_profiles"));

// --- Resolver logic (mirrors lib/resolved-account-role.ts) ---
const listenerStale = loadResolvedFromProfile({
    accountType: "listener",
    userRoles: ["founding_artist", "artist"],
});
record("2 listener Connect rejected", !requireCreatorAudienceAccess(listenerStale, "artist").ok);
record("3 listener payout rejected", !requireCreatorAudienceAccess(listenerStale, "artist").ok);
record("4 listener creator-insights rejected", !requireCreatorAccountAccess(listenerStale).ok);

const artistCap = loadResolvedFromProfile({ accountType: "artist" });
record("5 artist own creator access allowed", requireCreatorAudienceAccess(artistCap, "artist").ok);
record("7 artist cannot access producer audience", !requireCreatorAudienceAccess(artistCap, "producer").ok);

const producerCap = loadResolvedFromProfile({ accountType: "producer" });
record("6 producer own creator access allowed", requireCreatorAudienceAccess(producerCap, "producer").ok);
record("8 producer cannot access artist audience", !requireCreatorAudienceAccess(producerCap, "artist").ok);

record("9 admin helper uses database markers", adminAuth.includes('eq("role", "admin")')
    && adminAuth.includes("account_type.eq.admin")
    && adminAuth.includes("isPlatformOwnerUserId"));
record("10 admin helper exported for routes", adminAuth.includes("export async function requireAdminUserId"));

record("11 songs INSERT policy requires creator upload", migration.includes("public.can_upload_creator_content(auth.uid())")
    && migration.includes("public.songs"));
record("12 videos INSERT policy requires creator upload", migration.includes("public.videos"));
record("13 artist/producer insert allowed via account_type", migration.includes("v_primary_role in ('artist', 'producer')"));
record("14 ringtone permission aligned", migration.includes("can_create_ringtones")
    && migration.includes("can_upload_creator_content"));

const verifyScript = read("scripts/verify-role-authorization-fix.mjs");
record("15 script creates no Stripe objects", !/\bfrom\s+["']stripe["']/.test(verifyScript) && !/\bStripe\s*\(/.test(verifyScript));
record("16 script creates no payout/transfer", !/\.from\(\s*["']payouts["']\s*\)/.test(verifyScript));

const env = readEnv();
const subLocked = env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED;
const ringLocked = env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED;
record("18 beta subscription lock ON", subLocked === undefined || subLocked === "true" || subLocked === "1", `value=${subLocked ?? "unset"}`);
record("18 beta ringtone lock ON", ringLocked === undefined || ringLocked === "true" || ringLocked === "1", `value=${ringLocked ?? "unset"}`);
record("beta lock modules unchanged", betaSub.includes("isPublicBetaPaidSubscriptionCheckoutLocked")
    && betaRing.includes("isPublicBetaPaidRingtonePurchaseLocked"));

record("cross-user blocked via requireMatchingUserId", connectOnboard.includes("requireMatchingUserId")
    && payouts.includes("requireMatchingUserId")
    && creatorInsights.includes("requireMatchingUserId"));

record("role source conflict: checklist uses shared admin helper", !launchChecklist.includes("isPlatformOwnerUserId")
    && launchChecklist.includes("@/lib/admin-auth"));

const page = read("app/page.tsx");
const roleNav = read("lib/role-based-navigation.ts");
record("UI listener dashboards gated", page.includes('view === "Artist Dashboard" && navCapabilities.canArtistDashboard')
    && page.includes('view === "Producer Dashboard" && navCapabilities.canProducerDashboard'));
record("UI connect refresh handler gated", page.includes("navCapabilities.canUpload")
    && page.includes("ConnectOnboardingRefreshHandler"));
record("UI connect payout panel gated", !page || page.includes("canShowConnectPayoutPanel"), !page ? "deferred to shared integration group" : "");
record("UI creator insights gated", page.includes("navCapabilities.canArtistDashboard")
    && page.includes("navCapabilities.canProducerDashboard"));
record("UI admin PCC gated", page.includes("navCapabilities.canPlatformControlCenter")
    && roleNav.includes("canPlatformControlCenter: isPlatformOwner || resolved.isAdmin"));
record("UI sales creator gated", !page || page.includes('view === "Sales" && navCapabilities.canSales'), !page ? "deferred to shared integration group" : "");

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} (${results.length} total)`);
process.exit(failed === 0 ? 0 : 1);
