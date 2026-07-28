"use client";

export type MobileDisplayMode = "grid" | "list";

type MobileViewToggleProps = {
    mode: MobileDisplayMode;
    onChange: (mode: MobileDisplayMode) => void;
    gridLabel: string;
    listLabel: string;
    ariaLabel: string;
};

/**
 * Shared mobile Grid/List control. Bind to the same persistent displayMode
 * used by `.zml-app.view-grid` / `.zml-app.view-list`.
 */
export function MobileViewToggle({
    mode,
    onChange,
    gridLabel,
    listLabel,
    ariaLabel,
}: MobileViewToggleProps) {
    return (
        <div
            className="view-toggle"
            role="group"
            aria-label={ariaLabel}
            data-view-toggle="layout"
            data-mobile-view-toggle="true"
        >
            <button
                className={mode === "grid" ? "active" : ""}
                onClick={() => onChange("grid")}
                type="button"
                data-display-mode="grid"
                aria-pressed={mode === "grid"}
            >
                <span aria-hidden="true">□</span>
                {gridLabel}
            </button>
            <button
                className={mode === "list" ? "active" : ""}
                onClick={() => onChange("list")}
                type="button"
                data-display-mode="list"
                aria-pressed={mode === "list"}
            >
                <span aria-hidden="true">☰</span>
                {listLabel}
            </button>
        </div>
    );
}

/** Views that show a media card collection and therefore need Grid/List. */
export const MOBILE_VIEW_TOGGLE_VIEWS = [
    "Home",
    "Marketplace",
    "Library",
    "Liked",
    "Artists",
    "Videos",
    "Beats",
    "Playlists",
    "Queue",
    "Recently Played",
    "Sales",
    "Trending",
    "Following",
    "Artist Profile",
    "Producer Profile",
    "Artist Dashboard",
    "Producer Dashboard",
    "My Purchased Ringtones",
    "Favorite Ringtones",
    "Ringtone Marketplace",
    "My Ringtones",
    "Platform Control Center",
] as const;
