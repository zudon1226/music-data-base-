"use client";

import { useEffect, type Ref } from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "@/lib/i18n/provider";

export type DashboardNotification = {
    id: string;
    title: string;
    body: string;
    kind?: string | null;
    href?: string;
    itemId?: string;
    itemType?: string;
    read: boolean;
    createdAt: string;
};

const DROPDOWN_ITEM_LIMIT = 8;

type NotificationCenterPanelProps = {
    open: boolean;
    notifications: DashboardNotification[];
    unreadCount: number;
    loading?: boolean;
    onToggle: () => void;
    onClose: () => void;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClearRead: () => void;
    onNavigate: (notification: DashboardNotification) => void;
    /** Opens the full Notifications page view — only intentional page navigation entry. */
    onViewAll: () => void;
    formatTimestamp: (value: string) => string;
    wrapRef?: Ref<HTMLDivElement>;
};

/**
 * Topbar notification bell + dropdown popover.
 * Full Notifications page opens only via "View all notifications".
 */
export function NotificationCenterPanel({
    open,
    notifications,
    unreadCount,
    loading,
    onToggle,
    onClose,
    onMarkRead,
    onMarkAllRead,
    onClearRead,
    onNavigate,
    onViewAll,
    formatTimestamp,
    wrapRef,
}: NotificationCenterPanelProps) {
    const { t } = useTranslation();
    const recentNotifications = notifications.slice(0, DROPDOWN_ITEM_LIMIT);

    useEffect(() => {
        if (!open) return undefined;

        function onPointerDown(event: PointerEvent) {
            const target = event.target;
            if (!(target instanceof Node)) return;
            const root = typeof wrapRef === "object" && wrapRef && "current" in wrapRef
                ? wrapRef.current
                : null;
            if (root?.contains(target)) return;
            onClose();
        }

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        }

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose, wrapRef]);

    return (
        <div className="notification-wrap" ref={wrapRef} data-notification-dropdown={open ? "open" : "closed"}>
            <button
                aria-expanded={open}
                aria-haspopup="dialog"
                aria-label={t("notifications.title")}
                className="notification-button"
                onClick={onToggle}
                type="button"
                title={t("notifications.title")}
                data-notification-entry="topbar"
            >
                <Bell size={17} aria-hidden="true" />
                <span className="sr-only">{t("notifications.title")}</span>
                {unreadCount > 0 ? (
                    <span aria-label={t("dashboard.notifications.unreadCount", { count: unreadCount })}>
                        {unreadCount}
                    </span>
                ) : null}
            </button>
            {open ? (
                <section
                    aria-label={t("notifications.title")}
                    className={
                        !loading && notifications.length === 0
                            ? "notification-center notification-empty"
                            : "notification-center"
                    }
                    role="dialog"
                    data-notification-panel="dropdown"
                >
                    <div className="notification-head">
                        <div className="notification-head-title">
                            <strong className="notification-head-heading">{t("notifications.title")}</strong>
                            <small className="notification-head-unread">
                                {t("dashboard.notifications.unreadCount", { count: unreadCount })}
                            </small>
                        </div>
                        <div className="notification-head-actions">
                            <button
                                disabled={unreadCount === 0 || loading}
                                onClick={onMarkAllRead}
                                type="button"
                                data-notification-action="mark-all-read"
                            >
                                {t("dashboard.notifications.markAllRead")}
                            </button>
                            <button
                                disabled={loading || notifications.every((item) => !item.read)}
                                onClick={onClearRead}
                                type="button"
                                data-notification-action="clear-read"
                            >
                                {t("dashboard.notifications.clearRead")}
                            </button>
                        </div>
                    </div>
                    <div className="notification-center-body">
                        {loading ? <p>{t("common.loading")}</p> : null}
                        {!loading && notifications.length === 0 ? (
                            <p className="notification-empty-copy">{t("notifications.empty")}</p>
                        ) : null}
                        {!loading && recentNotifications.length > 0 ? (
                            <ul className="notification-list">
                                {recentNotifications.map((notification) => (
                                    <li key={notification.id}>
                                        <article
                                            className={
                                                notification.read
                                                    ? "notification-item is-read"
                                                    : "notification-item is-unread"
                                            }
                                        >
                                            <button
                                                className="notification-item-main"
                                                onClick={() => {
                                                    if (!notification.read) onMarkRead(notification.id);
                                                    onNavigate(notification);
                                                }}
                                                type="button"
                                            >
                                                <strong>{notification.title}</strong>
                                                <span>{notification.body}</span>
                                                <small>{formatTimestamp(notification.createdAt)}</small>
                                            </button>
                                        </article>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        className="notification-view-all"
                        onClick={onViewAll}
                        data-notification-action="view-all"
                    >
                        {t("common.viewAll")} {t("notifications.title")}
                    </button>
                </section>
            ) : null}
        </div>
    );
}
