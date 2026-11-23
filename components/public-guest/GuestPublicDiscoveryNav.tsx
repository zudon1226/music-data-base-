"use client";

import type { TranslationKey } from "@/lib/i18n/messages/en";
import { useTranslation } from "@/lib/i18n/provider";
import { isPublicBetaPaidRingtonePurchaseLocked } from "@/lib/public-beta-ringtone-purchase";
import {
    GUEST_PUBLIC_DISCOVERY_PATHS,
    GUEST_PUBLIC_DISCOVERY_SECTION_ORDER,
    type GuestPublicDiscoverySection,
} from "@/lib/public-guest-discovery";
import "./guest-public-discovery-nav.css";

const SECTION_I18N: Record<GuestPublicDiscoverySection, TranslationKey> = {
    home: "nav.home",
    music: "nav.music",
    videos: "nav.videos",
    ringtones: "nav.ringtones",
    mixtapes: "nav.mixtapes",
    podcasts: "nav.podcasts",
};

type GuestPublicDiscoveryNavProps = {
    activeSection: GuestPublicDiscoverySection;
    className?: string;
    layout?: "inline" | "horizontal";
};

/** Public guest routes only — real links, no client-only view switching. */
export function GuestPublicDiscoveryNav({
    activeSection,
    className = "",
    layout = "inline",
}: GuestPublicDiscoveryNavProps) {
    const { t } = useTranslation();
    const ringtonePurchasesBetaLocked = isPublicBetaPaidRingtonePurchaseLocked();

    return (
        <nav
            className={`guest-public-discovery-nav guest-public-discovery-nav--${layout} ${className}`.trim()}
            aria-label={t("nav.publicGuestDiscovery")}
            data-guest-public-discovery-nav="true"
            data-guest-discovery-layout={layout}
        >
            <div
                className="guest-public-discovery-nav__scroller"
                role="list"
            >
                <ul className="guest-public-discovery-nav__list">
                    {GUEST_PUBLIC_DISCOVERY_SECTION_ORDER.map((section) => {
                        const label = t(SECTION_I18N[section]);
                        const showBetaHint = section === "ringtones" && ringtonePurchasesBetaLocked;
                        return (
                            <li key={section} role="listitem">
                                <a
                                    href={GUEST_PUBLIC_DISCOVERY_PATHS[section]}
                                    className="guest-public-discovery-nav__link"
                                    data-guest-discovery-link={section}
                                    aria-current={activeSection === section ? "page" : undefined}
                                >
                                    <span>{label}</span>
                                    {showBetaHint ? (
                                        <span
                                            className="guest-public-discovery-nav__beta"
                                            title={t("nav.ringtonesBetaPurchasesLocked")}
                                        >
                                            {t("nav.betaBrowseOnly")}
                                        </span>
                                    ) : null}
                                </a>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </nav>
    );
}