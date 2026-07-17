"use client";

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

type NotificationCenterPanelProps = {
    open: boolean;
    notifications: DashboardNotification[];
    unreadCount: number;
    loading?: boolean;
    onToggle: () => void;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onDelete: (id: string) => void;
    onClearRead: () => void;
    onNavigate: (notification: DashboardNotification) => void;
    formatTimestamp: (value: string) => string;
    wrapRef?: React.Ref<HTMLDivElement>;
};

export function NotificationCenterPanel({
    open,
    notifications,
    unreadCount,
    loading,
    onToggle,
    onMarkRead,
    onMarkAllRead,
    onDelete,
    onClearRead,
    onNavigate,
    formatTimestamp,
    wrapRef,
}: NotificationCenterPanelProps) {
    const { t } = useTranslation();

    return (
        <div className="notification-wrap" ref={wrapRef}>
            <button
                aria-expanded={open}
                aria-haspopup="dialog"
                className="notification-button"
                onClick={onToggle}
                type="button"
                title={t("notifications.title")}
            >
                <Bell size={17} aria-hidden="true" />
                <span className="sr-only">{t("notifications.title")}</span>
                {unreadCount > 0 ? <span aria-label={t("dashboard.notifications.unreadCount", { count: unreadCount })}>{unreadCount}</span> : null}
            </button>
            {open ? (
                <section
                    aria-label={t("notifications.title")}
                    className={notifications.length === 0 ? "notification-center notification-empty" : "notification-center"}
                    role="dialog"
                >
                    <div className="notification-head">
                        <strong>{t("notifications.title")}</strong>
                        <div className="notification-head-actions">
                            <button disabled={unreadCount === 0 || loading} onClick={onMarkAllRead} type="button">
                                {t("dashboard.notifications.markAllRead")}
                            </button>
                            <button disabled={loading || notifications.every((item) => !item.read)} onClick={onClearRead} type="button">
                                {t("dashboard.notifications.clearRead")}
                            </button>
                        </div>
                    </div>
                    {loading ? <p>{t("common.loading")}</p> : null}
                    {!loading && notifications.length === 0 ? <p>{t("notifications.empty")}</p> : null}
                    {!loading && notifications.length > 0 ? (
                        <ul className="notification-list">
                            {notifications.slice(0, 40).map((notification) => (
                                <li key={notification.id}>
                                    <article className={notification.read ? "notification-item is-read" : "notification-item is-unread"}>
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
                                        <div className="notification-item-actions">
                                            {!notification.read ? (
                                                <button onClick={() => onMarkRead(notification.id)} type="button">
                                                    {t("dashboard.notifications.markRead")}
                                                </button>
                                            ) : null}
                                            <button onClick={() => onDelete(notification.id)} type="button">
                                                {t("common.delete")}
                                            </button>
                                        </div>
                                    </article>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </section>
            ) : null}
        </div>
    );
}
