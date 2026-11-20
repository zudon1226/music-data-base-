"use client";

import type { TranslationKey } from "@/lib/i18n/messages/en";
import { useTranslation } from "@/lib/i18n/provider";
import "./guest-public-discovery-nav.css";

export type GuestPublicDiscoverySection = "home" | "mixtapes" | "podcasts";

const SECTIONS: Array<{
    section: GuestPublicDiscoverySection;
    href: string;
    labelKey: TranslationKey;
}> = [
    { section: "home", href: "/", labelKey: "nav.home" },
    { section: "mixtapes", href: "/mixtapes", labelKey: "nav.mixtapes" },
    { section: "podcasts", href: "/podcast", labelKey: "nav.podcasts" },
];

type GuestPublicDiscoveryNavProps = {
    activeSection: GuestPublicDiscoverySection;
    className?: string;
};

/** Public guest routes only — real links, no client-only view switching. */
export function GuestPublicDiscoveryNav({ activeSection, className = "" }: GuestPublicDiscoveryNavProps) {
    const { t } = useTranslation();

    return (
        <nav
            className={`guest-public-discovery-nav ${className}`.trim()}
            aria-label={t("nav.publicGuestDiscovery")}
            data-guest-public-discovery-nav="true"
        >
            <ul className="guest-public-discovery-nav__list">
                {SECTIONS.map((item) => (
                    <li key={item.section}>
                        <a
                            href={item.href}
                            className="guest-public-discovery-nav__link"
                            data-guest-discovery-link={item.section}
                            aria-current={activeSection === item.section ? "page" : undefined}
                        >
                            {t(item.labelKey)}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}