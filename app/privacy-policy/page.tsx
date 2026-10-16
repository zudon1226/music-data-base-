import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPageLayout } from "@/components/legal/policy-page-layout";
import { getLegalPolicyContent } from "@/lib/legal-policy-content";
import { getLegalPolicyBySlug, LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR_NAME } from "@/lib/legal-policies";
import { getPublicSiteUrl } from "@/lib/server-supabase";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "Privacy Policy for Music Data Base (MDB), operated by Music Data Base LLC.",
    alternates: { canonical: `${getPublicSiteUrl()}/privacy-policy` },
};

/** Apple App Store and public web canonical URL for the Privacy Policy. */
export default function PrivacyPolicyPublicPage() {
    const policy = getLegalPolicyBySlug("privacy");
    if (!policy) {
        return (
            <main className="legal-policy-page">
                <p>Privacy Policy is unavailable.</p>
            </main>
        );
    }
    const sections = getLegalPolicyContent("privacy");

    return (
        <>
            <PolicyPageLayout policy={policy} sections={sections} />
            <div className="legal-policy-shell" style={{ marginTop: "-2rem", paddingBottom: "2rem" }}>
                <section className="legal-policy-section">
                    <h2>Public access</h2>
                    <p>
                        This Privacy Policy is published by {LEGAL_OPERATOR_NAME} and does not require a Music Data Base
                        account or sign-in to view.
                    </p>
                    <p>
                        Privacy questions and requests:{" "}
                        <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent("Privacy Request")}`}>
                            {LEGAL_CONTACT_EMAIL}
                        </a>
                    </p>
                    <p>
                        <Link href="/account-deletion">Account Deletion</Link>
                        {" · "}
                        <Link href="/">Return to Music Data Base</Link>
                    </p>
                </section>
            </div>
        </>
    );
}
