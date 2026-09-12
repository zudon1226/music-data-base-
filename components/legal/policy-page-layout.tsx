import Link from "next/link";
import type { LegalPolicyDefinition } from "@/lib/legal-policies";
import { LEGAL_POLICIES } from "@/lib/legal-policies";
import type { PolicySection } from "@/lib/legal-policy-content";

type Props = {
    policy: LegalPolicyDefinition;
    sections: PolicySection[];
};

export function PolicyPageLayout({ policy, sections }: Props) {
    return (
        <main className="legal-policy-page">
            <div className="legal-policy-shell">
                <header className="legal-policy-header">
                    <Link href="/" className="legal-policy-home-link">
                        ← Back to Music Data Base
                    </Link>
                    <p className="legal-policy-kicker">Music Data Base Legal</p>
                    <h1>{policy.title}</h1>
                    <p className="legal-policy-meta">
                        Last Updated: {policy.lastUpdated}
                        <span aria-hidden="true"> · </span>
                        Policy Version: {policy.version}
                    </p>
                </header>

                <article className="legal-policy-content">
                    {sections.map((section, index) => (
                        <section className="legal-policy-section" key={`${policy.slug}-${index}`}>
                            {section.heading ? <h2>{section.heading}</h2> : null}
                            {section.paragraphs?.map((paragraph, paragraphIndex) => (
                                <p key={`p-${paragraphIndex}`}>{paragraph}</p>
                            ))}
                            {section.list?.length ? (
                                <ul>
                                    {section.list.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    ))}
                </article>

                <footer className="legal-policy-footer">
                    <h2>Related Policies</h2>
                    <nav aria-label="Related legal policies">
                        <ul className="legal-policy-link-list">
                            {LEGAL_POLICIES.filter((entry) => entry.slug !== policy.slug).map((entry) => (
                                <li key={entry.slug}>
                                    <Link href={entry.publicPath}>{entry.shortTitle}</Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </footer>
            </div>
        </main>
    );
}
