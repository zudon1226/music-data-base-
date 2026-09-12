import Link from "next/link";
import { LEGAL_POLICIES } from "@/lib/legal-policies";

type Props = {
    className?: string;
};

export function PolicyLinksFooter({ className = "" }: Props) {
    return (
        <nav className={`legal-links-footer${className ? ` ${className}` : ""}`} aria-label="Legal policies">
            {LEGAL_POLICIES.map((policy) => (
                <Link key={policy.slug} href={policy.publicPath}>
                    {policy.shortTitle}
                </Link>
            ))}
        </nav>
    );
}
