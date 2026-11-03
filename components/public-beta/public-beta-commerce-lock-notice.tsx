"use client";

import {
    getPublicBetaCommerceLockMessage,
    isPublicBetaCommerceLocked,
} from "@/lib/public-beta-commerce-lock";
import "./public-beta-commerce-lock-notice.css";

type Props = {
    className?: string;
    compact?: boolean;
};

export function PublicBetaCommerceLockNotice({ className = "", compact = false }: Props) {
    if (!isPublicBetaCommerceLocked()) {
        return null;
    }
    const classes = [
        "public-beta-commerce-lock-notice",
        compact ? "is-compact" : "",
        className,
    ].filter(Boolean).join(" ");
    return (
        <p className={classes} role="status">
            {getPublicBetaCommerceLockMessage()}
        </p>
    );
}
