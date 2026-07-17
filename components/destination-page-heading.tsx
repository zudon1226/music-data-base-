"use client";

import type { ReactNode } from "react";

type DestinationPageHeadingProps = {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
};

/**
 * Canonical destination page heading for the SPA shell.
 * Owns data-page-heading / data-nav-destination markers used by navigation scroll.
 */
export function DestinationPageHeading({
    title,
    subtitle,
    actions,
}: DestinationPageHeadingProps) {
    return (
        <section
            className="section-heading destination-page-heading"
            data-nav-destination="heading"
        >
            <div>
                <h2 data-page-heading tabIndex={-1}>
                    {title}
                </h2>
                {subtitle ? <p>{subtitle}</p> : null}
            </div>
            {actions}
        </section>
    );
}
