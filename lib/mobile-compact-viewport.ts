/**
 * Mobile viewport (≤820px) — shared compact-layout breakpoint.
 */
export const MOBILE_COMPACT_MAX_WIDTH_PX = 820;
export const MOBILE_COMPACT_MEDIA = `(max-width: ${MOBILE_COMPACT_MAX_WIDTH_PX}px)`;

export function isMobileCompactViewport(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia(MOBILE_COMPACT_MEDIA).matches;
}
