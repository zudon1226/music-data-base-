"use client";

import { useLayoutEffect, useState } from "react";
import { isMobileCompactViewport, MOBILE_COMPACT_MEDIA } from "./mobile-compact-viewport";

/** True when the viewport uses the compact mobile card/chrome layout (≤820px). */
export function useMobileCompactLayout(): boolean {
    const [isMobile, setIsMobile] = useState(false);

    // useLayoutEffect so song/video rows paint the compact tree (with three-dot) before first paint
    // after hydration — avoids a desktop-card frame that has no overflow control on phones.
    useLayoutEffect(() => {
        const media = window.matchMedia(MOBILE_COMPACT_MEDIA);
        const sync = () => setIsMobile(media.matches);
        sync();
        media.addEventListener("change", sync);
        return () => media.removeEventListener("change", sync);
    }, []);

    return isMobile;
}

export { isMobileCompactViewport, MOBILE_COMPACT_MEDIA, MOBILE_COMPACT_MAX_WIDTH_PX } from "./mobile-compact-viewport";
