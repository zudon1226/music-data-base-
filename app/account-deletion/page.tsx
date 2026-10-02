import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPageLayout } from "@/components/legal/policy-page-layout";
import { getLegalPolicyContent } from "@/lib/legal-policy-content";
import { getLegalPolicyBySlug, LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR_NAME } from "@/lib/legal-policies";
import { getPublicSiteUrl } from "@/lib/server-supabase";

export const metadata: Metadata = {
    title: "Account Deletion",
    description: "How to delete your Music Data Base account and associated data.",
    alternates: { canonical: `${getPublicSiteUrl()}/account-deletion` },
};

export default function AccountDeletionPublicPage() {
    const policy = getLegalPolicyBySlug("account-deletion");
    if (!policy) {
        return (
            <main className="legal-policy-page">
                <p>Account deletion information is unavailable.</p>
            </main>
        );
    }
    const sections = getLegalPolicyContent("account_deletion");

    return (
        <>
            <PolicyPageLayout policy={policy} sections={sections} />
            <div className="legal-policy-shell" style={{ marginTop: "-2rem", paddingBottom: "2rem" }}>
                <section className="legal-policy-section">
                    <h2>Music Data Base</h2>
                    <p>
                        Music Data Base is operated by {LEGAL_OPERATOR_NAME}. This page is public and does not require a sign-in.
                    </p>
                    <p>
                        Deleting an account by email alone is never automatic. If you can sign in, use Profile → Account settings → Delete Account.
                        If you cannot sign in, email{" "}
                        <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent("Account Deletion Request")}`}>
                            {LEGAL_CONTACT_EMAIL}
                        </a>{" "}
                        from the address tied to your account when possible. We verify ownership before processing offline requests.
                    </p>
                    <p>
                        <Link href="/legal/privacy">Privacy Policy</Link>
                        {" · "}
                        <Link href="/">Return to Music Data Base</Link>
                    </p>
                </section>
            </div>
        </>
    );
}
