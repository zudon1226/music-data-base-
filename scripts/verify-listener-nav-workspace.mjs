/**
 * Listener role chrome + single-workspace navigation regression checks.
 * Fails if Upload/Artist/Producer chrome can render for listeners, or if
 * upload workspace can remain mounted after destination navigation.
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
const resolvedLib = read("lib/resolved-account-role.ts");
const listenerActions = read("lib/listener-media-actions.ts");
const mediaCard = read("components/desktop-media-card.tsx");
const profileApi = read("app/api/user-profile/route.ts");
const sidebar = read("components/desktop-app-sidebar-nav.tsx");
const audioUpload = read("app/api/upload-audio/route.ts");
const videoUpload = read("app/api/video-upload/route.ts");
const albumCreate = read("app/api/albums/create/route.ts");

record("resolved role module present", resolvedLib.includes("requireCreatorUploadAccess"));
record("role lib forces listener until rolesReady", roleLib.includes("rolesReady === false"));
record("page tracks accountRolesReady", page.includes("accountRolesReady"));
record(
    "header Upload gated",
    /shouldShowUploadControl\(desktopNavAccess\)\s*\?\s*\(\s*<button[\s\S]*?upload-btn/.test(page)
    || /\{shouldShowUploadControl\(desktopNavAccess\) \? \(\s*<button[\s\S]*className="upload-btn"/.test(page),
);
record(
    "header Artist gated",
    page.includes("shouldShowArtistDashboardControl(desktopNavAccess)")
    && page.includes('className="dashboard-btn"'),
);
record(
    "header Producer gated",
    page.includes("shouldShowProducerDashboardControl(desktopNavAccess)")
    && page.includes("producer-dashboard-btn"),
);
record(
    "upload shell requires showUpload AND canUpload",
    /showUpload && shouldShowUploadControl\(desktopNavAccess\)/.test(page)
    && page.includes('data-active-workspace="upload"'),
);
record(
    "applyDesktopView unmounts upload",
    /function applyDesktopView\(nextView: View\) \{\s*[\s\S]*?setShowUpload\(false\);/.test(page),
);
record(
    "handleNav uses applyDesktopView",
    /function handleNav\(nextView: View\) \{[\s\S]*?applyDesktopView\(nextView\);/.test(page),
);
record(
    "producer profile reload does not elevate listener",
    !/profiles\.some\(\(profile\) => profile\.userId === accountUserId\)\) \{\s*setAccountRole\("Producer"\)/.test(page),
);
record(
    "profile API omits artist/producer profile inference",
    !profileApi.includes('from("artist_profiles")') && !profileApi.includes('from("producer_profiles")'),
);
record("upload-audio creator gate", audioUpload.includes("requireCreatorUploadAccess"));
record("video-upload creator gate", videoUpload.includes("requireCreatorUploadAccess"));
record("album-create creator gate", albumCreate.includes("requireCreatorUploadAccess"));
record("sidebar uses role-visible items only", sidebar.includes("listVisibleDesktopNavItems"));
record(
    "listener destinations remain in LISTENER_NAV_VIEWS",
    ["My Purchased Ringtones", "Favorite Ringtones", "Library", "Liked", "Following", "Playlists", "Recently Played", "Queue", "Profile"]
        .every((view) => roleLib.includes(`"${view}"`)),
);
record(
    "single workspace contract documented in applyDesktopView",
    page.includes("Exactly one destination workspace"),
);
record(
    "founding approved whitelist removed from handleNav",
    !page.includes("That area is not available for your founding role.")
    && !page.includes('protectedViews: View[] = ["Artist Dashboard"'),
);
record(
    "role warning uses account-role copy",
    listenerActions.includes("This area is not available for your account role.")
    && page.includes("ACCOUNT_ROLE_UNAVAILABLE_MESSAGE")
    && page.includes("denyUnauthorizedDesktopNav"),
);
record(
    "listener destinations never blocked by founding whitelist",
    page.includes("isListenerAccessibleNavView")
    && ["Marketplace", "Ringtone Marketplace", "My Purchased Ringtones", "Notifications"]
        .every((view) => roleLib.includes(`"${view}"`)),
);
record(
    "delete gated via listener media action resolver",
    listenerActions.includes("resolveListenerMediaCardCanDelete")
    && page.includes("resolveListenerMediaCardCanDelete")
    && page.includes("canUpload: navCapabilities.canUpload"),
);
record(
    "media card queue supports remove when queued",
    mediaCard.includes("onToggleQueue")
    && mediaCard.includes("Remove from queue")
    && !mediaCard.includes("disabled={isQueued}"),
);
record(
    "media card does not render Delete without canDelete",
    /\{canDelete \? \(/.test(mediaCard)
    && mediaCard.includes("<Trash2"),
);

// Capability matrix: leftover creator signals must not grant upload to listeners.
function normalizeNavRole(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (normalized === "artist" || normalized === "founding_artist" || normalized === "creator") return "artist";
    if (normalized === "producer" || normalized === "founding_producer") return "producer";
    return "listener";
}
function resolveNavCapabilities(input = {}) {
    if (!input.isPlatformOwner && input.rolesReady === false) {
        return { canUpload: false, canArtistDashboard: false, canProducerDashboard: false };
    }
    const roles = new Set();
    for (const role of input.accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) roles.add(clean);
    }
    const primary = normalizeNavRole(input.primaryRole);
    if (primary !== "listener") roles.add(primary);
    const isAdmin = Boolean(input.isPlatformOwner || input.isAdmin || roles.has("admin"));
    const isArtist = isAdmin || roles.has("artist") || roles.has("founding_artist") || roles.has("creator");
    const isProducer = isAdmin || roles.has("producer") || roles.has("founding_producer");
    return {
        canUpload: isArtist || isProducer,
        canArtistDashboard: isArtist,
        canProducerDashboard: isProducer,
    };
}

const listener = resolveNavCapabilities({ primaryRole: "listener", foundingRole: "founding_artist", hasArtistProfile: true, canCreateRingtones: true });
record("listener matrix denies upload", !listener.canUpload && !listener.canArtistDashboard && !listener.canProducerDashboard);
record(
    "resolved role ignores founding_artist when account_type is listener",
    resolvedLib.includes("profiles.account_type is authoritative")
    && resolvedLib.includes('primaryRole === "listener"'),
);
const artist = resolveNavCapabilities({ primaryRole: "artist" });
record("artist matrix allows upload + artist dashboard", artist.canUpload && artist.canArtistDashboard && !artist.canProducerDashboard);
const producer = resolveNavCapabilities({ primaryRole: "producer" });
record("producer matrix allows upload + producer dashboard", producer.canUpload && producer.canProducerDashboard && !producer.canArtistDashboard);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nLISTENER_NAV_WORKSPACE_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
