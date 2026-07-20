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
    unreadCount: number;
    /** Opens the canonical Notifications main-content view (not an overlay). */
    onOpen: () => void;
};

/**
 * Topbar notification entry point — bell + unread badge only.
 * Notification content lives in the dedicated Notifications page view.
 */
export function NotificationCenterPanel({
    unreadCount,
    onOpen,
}: NotificationCenterPanelProps) {
    const { t } = useTranslation();

    return (
        <div className="notification-wrap">
            <button
                aria-label={t("notifications.title")}
                className="notification-button"
                onClick={onOpen}
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
        </div>
    );
}
