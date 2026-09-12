import { NextResponse } from "next/server";
import { isLegalPolicyType, validateSignupAcceptanceInput } from "@/lib/legal-policies";
import { parseSignupAccountTypeInput } from "@/lib/signup-account-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const parsedAccountType = parseSignupAccountTypeInput(body.accountType);
    if (!parsedAccountType.ok) {
        return NextResponse.json({ error: parsedAccountType.error }, { status: 400 });
    }

    const raw = Array.isArray(body.acceptances) ? body.acceptances : [];
    const acceptances = raw
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const record = entry as Record<string, unknown>;
            const policyType = String(record.policyType || record.policy_type || "").trim();
            const policyVersion = String(record.policyVersion || record.policy_version || "").trim();
            if (!isLegalPolicyType(policyType) || !policyVersion) return null;
            return { policyType, policyVersion };
        })
        .filter(Boolean) as Array<{ policyType: import("@/lib/legal-policies").LegalPolicyType; policyVersion: string }>;

    const validation = validateSignupAcceptanceInput(parsedAccountType.accountType, acceptances);
    if (!validation.ok) {
        return NextResponse.json(
            { ok: false, error: validation.error, missing: validation.missing },
            { status: 400 },
        );
    }

    return NextResponse.json({
        ok: true,
        accountType: parsedAccountType.accountType,
        required: validation.required,
    });
}
