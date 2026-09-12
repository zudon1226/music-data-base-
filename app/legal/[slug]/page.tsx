import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyPageLayout } from "@/components/legal/policy-page-layout";
import { getLegalPolicyContent } from "@/lib/legal-policy-content";
import { getLegalPolicyBySlug, LEGAL_POLICY_SLUGS } from "@/lib/legal-policies";
import { getPublicSiteUrl } from "@/lib/server-supabase";

type PageProps = {
    params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
    return LEGAL_POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params;
    const policy = getLegalPolicyBySlug(slug);
    if (!policy) {
        return { title: "Policy Not Found" };
    }
    const url = `${getPublicSiteUrl()}${policy.publicPath}`;
    return {
        title: policy.title,
        description: `${policy.title} for Music Data Base.`,
        alternates: { canonical: url },
    };
}

export default async function LegalPolicyPage({ params }: PageProps) {
    const { slug } = await params;
    const policy = getLegalPolicyBySlug(slug);
    if (!policy) notFound();
    const sections = getLegalPolicyContent(policy.type);
    return <PolicyPageLayout policy={policy} sections={sections} />;
}
