/**
 * Notification bell dropdown + full page contracts.
 * Bell opens a popover without changing the current page view.
 * Full Notifications page opens only via "View all" (or equivalent intentional nav).
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
const topbarBellCount = (page.match(/<NotificationCenterPanel[\s\S]*?\/>/g) || []).length
    || (page.match(/<NotificationCenterPanel[\s\S]*?<\/NotificationCenterPanel>/g) || []).length;
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

// --- Dropdown popover (not page navigation) ---
record(
    "topbell toggles dropdown without handleNav",
    panel.includes("onToggle")
        && panel.includes('role="dialog"')
        && panel.includes("notification-center")
        && panel.includes("aria-haspopup")
        && page.includes("showNotificationCenter")
        && page.includes("setShowNotificationCenter")
        && !page.includes('onOpen={() => handleNav("Notifications")}'),
);
record(
    "dropdown open does not set Notifications view",
    page.includes("onToggle={() => {")
        && page.includes("setShowNotificationCenter((value) => {")
        && !/onToggle=\{\(\) => \{\s*handleNav\("Notifications"\)/.test(page),
);
record(
    "outside click and Escape close dropdown",
    panel.includes('event.key === "Escape"')
        && panel.includes('pointerdown')
        && panel.includes("onClose"),
);
record(
    "dropdown reuses shared notifications state",
    page.includes("notifications={notifications}")
        && page.includes("unreadCount={unreadNotifications}")
        && page.includes("onMarkAllRead={() => { markNotificationsRead(); }}")
        && page.includes("onClearRead={() => { void clearReadNotifications(); }}"),
);
record(
    "dropdown limits recent items and scrolls body",
    panel.includes("DROPDOWN_ITEM_LIMIT")
        && panel.includes("notification-center-body")
        && page.includes(".notification-center-body")
        && /overflow-y:\s*auto/.test(page),
);
record(
    "dropdown stacks above page content and player",
    /z-index:\s*80/.test(page)
        && page.includes(".topbar:has(.notification-center)")
        && /z-index:\s*9999/.test(page),
);

// --- Full page only via View all ---
record(
    "View all opens canonical Notifications page",
    panel.includes('data-notification-action="view-all"')
        && page.includes("onViewAll={() => {")
        && page.includes('handleNav("Notifications")')
        && page.includes('view === "Notifications"')
        && page.includes('data-notifications-view="canonical"'),
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
record(
    "section nav closes dropdown via applyDesktopView / handleNav",
    page.includes("function applyDesktopView")
        && page.includes("function handleNav")
        && page.includes("setShowNotificationCenter(false)")
        && page.includes("setView(nextView)"),
);
record(
    "Notifications reload on dropdown open and full page enter",
    page.includes("if (next) void reloadNotificationsFromServer()")
        && /if \(nextView === "Notifications"\) \{\s*void reloadNotificationsFromServer\(\);/.test(page),
);

// --- Actions preserved ---
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
    "dropdown exposes mark-all and clear-read",
    panel.includes('data-notification-action="mark-all-read"')
        && panel.includes('data-notification-action="clear-read"')
        && panel.includes('notifications.empty'),
);
record(
    "Notifications stays role-accessible outside sidebar",
    /LISTENER_ACCESSIBLE_VIEWS[\s\S]*"Notifications"/.test(roleLib)
        && !/LISTENER_NAV_VIEWS[\s\S]*"Notifications"/.test(roleLib.split("LISTENER_ACCESSIBLE_VIEWS")[0]),
);

// --- Responsive / viewport contracts ---
record(
    "mobile portrait / landscape / desktop still share topbar account actions",
    page.includes("topbar-account-actions")
        && page.includes("@media (max-width: 820px)")
        && page.includes("@media (max-width: 430px)"),
);
record(
    "mobile dropdown stays in content area away from sidebar",
    page.includes("calc(100vw - var(--mobile-sidebar-width, 64px) - 24px)")
        && panel.includes('data-notification-panel="dropdown"'),
);
record("package exposes verify:notifications-nav", pkg.includes("verify:notifications-nav"));
record("responsive layout lock script still present", layoutLock.includes("Responsive UI stability lock"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nNOTIFICATION_NAV_CANONICAL_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
