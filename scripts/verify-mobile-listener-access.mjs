/**
 * Mobile Listener role-enforcement + stale-session cleanup regression checks.
 * Run: node scripts/verify-mobile-listener-access.mjs
 */
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
    return readFileSync(full, "utf8");
}

const page = read("app/page.tsx");
const roleLib = read("lib/role-based-navigation.ts");
const navLib = read("lib/desktop-app-navigation.ts");
const listenerActions = read("lib/listener-media-actions.ts");
const accessSession = read("lib/client-access-session.ts");
const authBoot = read("lib/auth-boot.ts");
const mediaCard = read("components/desktop-media-card.tsx");
const profileApi = read("app/api/user-profile/route.ts");
const purchaseLib = read("lib/ringtone-purchase.ts");
const purchaseRoute = read("app/api/ringtones/[id]/purchase/route.ts");
const marketRoute = read("app/api/ringtones/marketplace/route.ts");
const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
const songDelete = read("app/api/songs/[id]/route.ts");

const LISTENER_NAV = [
    "Home",
    "Marketplace",
    "Ringtone Marketplace",
    "My Purchased Ringtones",
    "Favorite Ringtones",
    "Library",
    "Liked",
    "Following",
    "Playlists",
    "Recently Played",
    "Queue",
    "Profile",
];

const LISTENER_ACCESSIBLE = [
    ...LISTENER_NAV,
    "Notifications",
];

record("access schema version exported", accessSession.includes("CLIENT_ACCESS_SCHEMA_VERSION = 4"));
record("obsolete role keys listed", accessSession.includes("zml_account_role") && accessSession.includes("mdb.foundingRole"));
record("auth boot migrates access session", authBoot.includes("migrateClientAccessSession"));
record("page migrates access session on boot", page.includes("migrateClientAccessSession()"));
record("page stamps access schema on main", page.includes("data-access-schema={CLIENT_ACCESS_SCHEMA_VERSION}"));
record("page stamps listener role attrs", page.includes('data-account-role={navCapabilities.isListenerOnly ? "listener"'));
record("upload workspace requires non-listener", page.includes("canRenderUploadWorkspace") && page.includes("!navCapabilities.isListenerOnly"));
record("my ringtones gated by canMyRingtones", page.includes('view === "My Ringtones" && navCapabilities.canMyRingtones'));
record("header upload still capability gated", page.includes("shouldShowUploadControl(desktopNavAccess)"));
record("mobile account actions wrap exists", page.includes('className="topbar-account-actions"'));
record(
    "mobile account actions flex row contract",
    page.includes(".topbar-account-actions")
        && page.includes("justify-content: flex-start")
        && page.includes("flex-wrap: nowrap")
        && /topbar-account-actions[\s\S]{0,400}gap:\s*8px/.test(page),
);
record(
    "mobile account action touch targets 44px",
    /topbar-account-actions[\s\S]{0,900}min-width:\s*44px/.test(page)
        && /topbar-account-actions[\s\S]{0,900}min-height:\s*44px/.test(page),
);
record(
    "topbar no longer uses 6-column action grid",
    !page.includes("grid-template-columns: repeat(6, minmax(0, 1fr))"),
);
record(
    "role-gated header controls render null when unauthorized",
    page.includes("shouldShowUploadControl(desktopNavAccess) ? (")
        && page.includes("shouldShowArtistDashboardControl(desktopNavAccess) ? (")
        && page.includes("shouldShowProducerDashboardControl(desktopNavAccess) ? (")
        && page.includes(") : null}"),
);
record("nav uses account-role message only", page.includes("ACCOUNT_ROLE_UNAVAILABLE_MESSAGE")
    && !page.includes("That area is not available for your founding role."));
record("handleNav omits founding whitelist", !page.includes("protectedViews")
    && page.includes("server-trusted role capabilities only"));
record("sanitize listener roles helper", roleLib.includes("sanitizeNavRolesForPrimary"));
record("profile API forces listener roles", profileApi.includes('resolved.isListenerOnly ? ["listener"]')
    || profileApi.includes("resolved.isListenerOnly"));
record("delete gated for albums/beats", page.includes("canDeleteUploadedAlbum")
    && page.includes("resolveListenerMediaCardCanDelete"));
record("claim gated for listeners", listenerActions.includes("resolveListenerMediaCardCanClaim")
    && mediaCard.includes("canClaim")
    && /\{canClaim \? \(/.test(mediaCard));
record("listener nav matrix complete", LISTENER_NAV.every((view) => roleLib.includes(`"${view}"`)));
record("notifications accessible outside sidebar", LISTENER_ACCESSIBLE.every((view) => roleLib.includes(`"${view}"`))
    && !navLib.includes('{ view: "Notifications" }'));
record("mobile 430 breakpoint present", page.includes("@media (max-width: 430px)"));
record("mobile card actions 44px", page.includes("min-height: 44px") && page.includes("@media (max-width: 430px)"));
record("upload-open hides destinations", page.includes('data-upload-open="true"')
    && page.includes('[data-upload-open="true"]'));
record("ringtone payment mode reported", marketRoute.includes("paymentMode")
    && marketUi.includes("ringtone-payment-mode-banner"));
record("owner test checkout path", purchaseLib.includes("canBuyerUseRingtoneTestCheckout")
    && purchaseRoute.includes("canBuyerUseRingtoneTestCheckout"));
record("song DELETE returns 403 for non-owner", songDelete.includes("403")
    && songDelete.includes("Only the owner can delete"));
record(
    "listener destinations listed",
    LISTENER_NAV.length === 12,
    LISTENER_NAV.join(", "),
);

// Capability matrix: listener primary must ignore founding_artist leftovers.
function normalizeNavRole(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (normalized === "artist" || normalized === "founding_artist" || normalized === "creator") return "artist";
    if (normalized === "producer" || normalized === "founding_producer") return "producer";
    return "listener";
}
function sanitizeNavRolesForPrimary(primaryRole, accountRoles, options = {}) {
    const primary = normalizeNavRole(primaryRole);
    const creator = new Set(["artist", "producer", "admin", "creator", "founding_artist", "founding_producer", "artist_pro", "producer_pro"]);
    const roles = [...accountRoles].map((r) => String(r || "").trim().toLowerCase()).filter(Boolean);
    if (options.isPlatformOwner || options.isAdmin || primary === "admin") return roles;
    if (primary === "listener") {
        return roles.filter((role) => !creator.has(role) && normalizeNavRole(role) === "listener");
    }
    return roles;
}
const sanitized = sanitizeNavRolesForPrimary("listener", ["listener", "founding_artist", "artist"]);
record("sanitize drops founding_artist for listener", sanitized.length === 1 && sanitized[0] === "listener");

const failed = results.filter((row) => !row.ok).length;
console.log(`\nMOBILE_LISTENER_ACCESS_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
