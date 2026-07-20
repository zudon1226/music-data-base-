/**
 * Canonical Notifications navigation + layering contracts.
 * Ensures one topbar entry point, no sidebar duplicate, no overlay panel over Home.
 * Run: node scripts/verify-notification-nav-canonical.mjs
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
const panel = read("components/notification-center-panel.tsx");
const sidebar = read("components/desktop-app-sidebar-nav.tsx");
const navLib = read("lib/desktop-app-navigation.ts");
const roleLib = read("lib/role-based-navigation.ts");
const pkg = read("package.json");
const layoutLock = read("scripts/verify-responsive-stability-lock.mjs");

// --- Single visible notification control ---
const topbarBellCount = (page.match(/<NotificationCenterPanel[\s\S]*?\/>/g) || []).length;
record("exactly one NotificationCenterPanel mount site", topbarBellCount === 1);
record("topbar bell remains visible entry", panel.includes('data-notification-entry="topbar"')
    && panel.includes('className="notification-button"')
    && page.includes("<NotificationCenterPanel"));
record("sidebar Notifications nav item absent from DESKTOP_NAV_ITEMS", !navLib.includes('{ view: "Notifications" }'));
record(
    "sidebar does not render Notifications button",
    !/data-nav-view=\{?["']Notifications["']\}?/.test(sidebar)
        && !sidebar.includes('data-nav-view="Notifications"'),
);
record(
    "unread badge remains on topbell",
    panel.includes("unreadCount")
        && panel.includes("dashboard.notifications.unreadCount")
        && /notification-button[\s\S]{0,400}\{unreadCount > 0/.test(panel),
);

// --- Canonical view, not overlay ---
record(
    "topbell opens canonical Notifications section",
    page.includes('onOpen={() => handleNav("Notifications")}')
        && panel.includes("onOpen")
        && !panel.includes("onToggle"),
);
record(
    "overlay/dropdown notification panel eliminated",
    !panel.includes("notification-center")
        && !panel.includes('role="dialog"')
        && !panel.includes("aria-haspopup")
        && !page.includes("showNotificationCenter")
        && !page.includes("setShowNotificationCenter"),
);
record(
    "canonical Notifications page replaces main content",
    page.includes('view === "Notifications"')
        && page.includes('data-notifications-view="canonical"')
        && /\{view === "Notifications" \? \(/.test(page),
);
record(
    "Home hero not mounted under Notifications",
    /\{view === "Home" && !search\.trim\(\) && \(<>/.test(page)
        && page.includes('className="hero"'),
);
record(
    "subscription section gated to Home view",
    page.includes('view === "Home"')
        && (page.includes("SubscriptionBillingPanel") || page.includes("subscription")),
);
record(
    "only one Notifications page section markup",
    (page.match(/data-notifications-view="canonical"/g) || []).length === 1
        && (page.match(/className="notifications-page dashboard-page"/g) || []).length === 1,
);

// --- Navigation cleanup / no stale overlay ---
record(
    "section nav uses applyDesktopView / handleNav (replaces Notifications)",
    page.includes("function applyDesktopView")
        && page.includes("function handleNav")
        && page.includes("setView(nextView)"),
);
record(
    "rapid Home → Notifications → Library path uses same setView switch",
    (page.includes('onOpen={() => handleNav("Notifications")}') || page.includes('handleNav("Notifications")'))
        && page.includes('handleNav("Library")'),
);
record(
    "Notifications reload on enter, no overlay state",
    /if \(nextView === "Notifications"\) \{\s*void reloadNotificationsFromServer\(\);/.test(page)
        && !page.includes("notificationWrapRef"),
);

// --- Actions preserved on page view ---
record(
    "notification actions remain on canonical page",
    page.includes('data-notification-action="mark-all-read"')
        && page.includes('data-notification-action="clear-read"')
        && page.includes('data-notification-action="delete"')
        && page.includes("markNotificationsRead")
        && page.includes("clearReadNotifications")
        && page.includes("deleteNotification"),
);
record(
    "Notifications stays role-accessible outside sidebar",
    /LISTENER_ACCESSIBLE_VIEWS[\s\S]*"Notifications"/.test(roleLib)
        && !/LISTENER_NAV_VIEWS[\s\S]*"Notifications"/.test(roleLib.split("LISTENER_ACCESSIBLE_VIEWS")[0]),
);

// --- Responsive / viewport contracts (static markers; layout lock remains separate) ---
record(
    "mobile portrait / landscape / desktop still share topbar account actions",
    page.includes("topbar-account-actions")
        && page.includes("@media (max-width: 820px)")
        && page.includes("@media (max-width: 430px)"),
);
record("package exposes verify:notifications-nav", pkg.includes("verify:notifications-nav"));
record("responsive layout lock script still present", layoutLock.includes("Responsive UI stability lock"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nNOTIFICATION_NAV_CANONICAL_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
