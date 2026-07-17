/**
 * Role-based navigation matrix verification (Listener / Artist / Producer / Admin).
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

/** Mirrors lib/role-based-navigation.ts for offline matrix checks. */
function normalizeNavRole(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (normalized === "artist" || normalized === "founding_artist") return "artist";
    if (normalized === "producer" || normalized === "founding_producer") return "producer";
    return "listener";
}

function resolveNavCapabilities(input = {}) {
    const roles = new Set();
    for (const role of input.accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) roles.add(clean);
    }
    const primary = normalizeNavRole(input.primaryRole);
    if (primary !== "listener") roles.add(primary);
    const founding = String(input.foundingRole || "").trim().toLowerCase();
    if (founding === "founding_artist" || founding === "artist") roles.add("artist");
    if (founding === "founding_producer" || founding === "producer") roles.add("producer");
    if (input.hasArtistProfile) roles.add("artist");
    if (input.hasProducerProfile) roles.add("producer");
    if (input.isPlatformOwner || input.isAdmin) roles.add("admin");

    const isPlatformOwner = Boolean(input.isPlatformOwner);
    const isAdmin = isPlatformOwner || Boolean(input.isAdmin) || roles.has("admin");
    const isArtist = isAdmin || roles.has("artist") || roles.has("founding_artist") || Boolean(input.hasArtistProfile);
    const isProducer = isAdmin || roles.has("producer") || roles.has("founding_producer") || Boolean(input.hasProducerProfile);
    const isCreator = isArtist || isProducer || Boolean(input.canCreateRingtones);

    if (isPlatformOwner || isAdmin) {
        return {
            isPlatformOwner,
            isAdmin: true,
            isArtist: true,
            isProducer: true,
            canUpload: true,
            canArtistDashboard: true,
            canProducerDashboard: true,
            canPlatformControlCenter: isPlatformOwner,
            canSales: true,
            canMyRingtones: true,
        };
    }
    return {
        isPlatformOwner: false,
        isAdmin: false,
        isArtist,
        isProducer,
        canUpload: isCreator,
        canArtistDashboard: isArtist,
        canProducerDashboard: isProducer,
        canPlatformControlCenter: false,
        canSales: isCreator,
        canMyRingtones: isCreator || Boolean(input.canCreateRingtones),
    };
}

const LISTENER_NAV_VIEWS = [
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
    "Notifications",
];

const LISTENER_ACCESSIBLE_VIEWS = [
    ...LISTENER_NAV_VIEWS,
    "License History",
    "Trending",
    "Beats",
    "Artists",
    "Videos",
];

const ALL_NAV_VIEWS = [
    ...LISTENER_NAV_VIEWS,
    "Sales",
    "Artist Dashboard",
    "Producer Dashboard",
    "My Ringtones",
    "Platform Control Center",
];

function canAccessNavView(view, capabilities) {
    if (capabilities.isPlatformOwner || capabilities.canPlatformControlCenter) return true;
    if (view === "Platform Control Center") return capabilities.canPlatformControlCenter;
    if (view === "Artist Dashboard" || view === "Artist Profile") return capabilities.canArtistDashboard;
    if (view === "Producer Dashboard" || view === "Producer Profile") return capabilities.canProducerDashboard;
    if (view === "Sales") return capabilities.canSales;
    if (view === "My Ringtones") return capabilities.canMyRingtones;
    return LISTENER_ACCESSIBLE_VIEWS.includes(view);
}

function visibleViews(capabilities) {
    return ALL_NAV_VIEWS.filter((view) => canAccessNavView(view, capabilities));
}

const page = read("app/page.tsx");
const navLib = read("lib/desktop-app-navigation.ts");
const roleLib = read("lib/role-based-navigation.ts");
const profileApi = read("app/api/user-profile/route.ts");
const sidebar = read("components/desktop-app-sidebar-nav.tsx");
const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");

record("role helper module present", roleLib.includes("resolveNavCapabilities") && roleLib.includes("LISTENER_NAV_VIEWS"));
record("listener accessible allowlist present", roleLib.includes("LISTENER_ACCESSIBLE_VIEWS"));
record("nav items mark role requirements", navLib.includes("requiresArtistDashboard: true")
    && navLib.includes("requiresProducerDashboard: true")
    && navLib.includes("requiresCreator: true")
    && navLib.includes("requiresOwner: true"));
record("sidebar includes Favorite Ringtones + Notifications", navLib.includes('"Favorite Ringtones"') && navLib.includes('"Notifications"'));
record("sidebar omits discovery from DESKTOP_NAV_ITEMS", !/DESKTOP_NAV_ITEMS[\s\S]*\{ view: "Trending" \}/.test(navLib)
    && !navLib.includes('{ view: "License History" }')
    && !navLib.includes('{ view: "Beats" }'));
record("page wires role-gated header controls", page.includes("shouldShowUploadControl(desktopNavAccess)")
    && page.includes("shouldShowArtistDashboardControl(desktopNavAccess)")
    && page.includes("shouldShowProducerDashboardControl(desktopNavAccess)"));
record("sidebar uses handleNav for role gates", /onNavigate=\{\(nextView\) => \{\s*handleNav\(nextView as View\);/.test(page));
record("sidebar supports onRoleRequired", sidebar.includes("onRoleRequired"));
record("profile API returns roles array", profileApi.includes("roles") && profileApi.includes("isArtist") && profileApi.includes("isProducer"));
record("normalizeAccountRole accepts lowercase", page.includes('normalized === "artist"') && page.includes('normalized === "producer"'));
record("unauthorized view bounce exists", page.includes("evaluateDesktopNavAccess(view as DesktopNavView, desktopNavAccess)"));
record("source keeps PCC owner-gated", roleLib.includes("canPlatformControlCenter: isPlatformOwner"));
record("ringtone destinations are separate", page.includes('view === "Favorite Ringtones"')
    && marketUi.includes('destination === "purchased"')
    && marketUi.includes("browseMarketplace")
    && !marketUi.includes("ringtone-market-tabs"));
record("purchased empty has marketplace CTA only", marketUi.includes("ringtone-purchased-empty")
    && marketUi.includes("onBrowseMarketplace")
    && !/purchasedEmpty[\s\S]{0,200}ringtone-market-grid/.test(marketUi));

const listenerCaps = resolveNavCapabilities({ primaryRole: "listener" });
const artistCaps = resolveNavCapabilities({ primaryRole: "artist" });
const producerCaps = resolveNavCapabilities({ primaryRole: "producer" });
const bothCaps = resolveNavCapabilities({ accountRoles: ["artist", "producer"] });
const ownerCaps = resolveNavCapabilities({ isPlatformOwner: true });
const adminCaps = resolveNavCapabilities({ isAdmin: true, accountRoles: ["admin"] });

const listenerViews = visibleViews(listenerCaps);
const artistViews = visibleViews(artistCaps);
const producerViews = visibleViews(producerCaps);
const bothViews = visibleViews(bothCaps);
const ownerViews = visibleViews(ownerCaps);
const adminViews = visibleViews(adminCaps);

record("listener sees core destinations", LISTENER_NAV_VIEWS.every((view) => listenerViews.includes(view)), listenerViews.join(", "));
record(
    "listener hides creator/admin destinations",
    ["Artist Dashboard", "Producer Dashboard", "Platform Control Center", "Sales", "My Ringtones"]
        .every((view) => !listenerViews.includes(view)),
    listenerViews.join(", "),
);
record("listener upload/dashboard flags off", !listenerCaps.canUpload && !listenerCaps.canArtistDashboard && !listenerCaps.canProducerDashboard);
record(
    "listener nav excludes discovery sidebar items",
    ["Trending", "Beats", "Artists", "Videos", "License History"].every((view) => !LISTENER_NAV_VIEWS.includes(view)),
);

record(
    "artist matrix",
    LISTENER_NAV_VIEWS.every((view) => artistViews.includes(view))
        && artistViews.includes("Artist Dashboard")
        && artistViews.includes("Sales")
        && !artistViews.includes("Producer Dashboard")
        && !artistViews.includes("Platform Control Center")
        && artistCaps.canUpload,
);

record(
    "producer matrix",
    LISTENER_NAV_VIEWS.every((view) => producerViews.includes(view))
        && producerViews.includes("Producer Dashboard")
        && producerViews.includes("Sales")
        && !producerViews.includes("Artist Dashboard")
        && !producerViews.includes("Platform Control Center")
        && producerCaps.canUpload,
);

record(
    "both roles matrix",
    bothViews.includes("Artist Dashboard")
        && bothViews.includes("Producer Dashboard")
        && bothCaps.canUpload
        && !bothViews.includes("Platform Control Center"),
);

record(
    "owner matrix",
    ownerViews.includes("Platform Control Center")
        && ownerViews.includes("Artist Dashboard")
        && ownerViews.includes("Producer Dashboard")
        && ownerViews.includes("Sales")
        && ownerViews.includes("My Ringtones")
        && ownerCaps.canUpload,
);

record(
    "admin matrix",
    adminViews.includes("Artist Dashboard")
        && adminViews.includes("Producer Dashboard")
        && adminViews.includes("Sales")
        && !adminViews.includes("Platform Control Center")
        && adminCaps.canUpload,
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nROLE_BASED_NAV_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
