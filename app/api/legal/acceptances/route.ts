import { NextResponse } from "next/server";
import {
    listUserLegalAcceptances,
    recordLegalAcceptances,
    recordSignupLegalAcceptances,
} from "@/lib/legal-acceptance-service";
import { isLegalPolicyType, type LegalPolicyType } from "@/lib/legal-policies";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";
import { parseSignupAccountTypeInput } from "@/lib/signup-account-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseAcceptances(body: Record<string, unknown>) {
    const raw = Array.isArray(body.acceptances) ? body.acceptances : [];
    return raw
        .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const record = entry as Record<string, unknown>;
            const policyType = String(record.policyType || record.policy_type || "").trim();
            const policyVersion = String(record.policyVersion || record.policy_version || "").trim();
            if (!isLegalPolicyType(policyType) || !policyVersion) return null;
            return { policyType, policyVersion };
        })
        .filter(Boolean) as Array<{ policyType: LegalPolicyType; policyVersion: string }>;
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = String(url.searchParams.get("userId") || "").trim();
        if (!isUuid(userId)) {
            return NextResponse.json({ error: "Valid userId is required." }, { status: 400 });
        }
        const auth = await requireMatchingUserId(request, "/api/legal/acceptances", userId);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }
        const acceptances = await listUserLegalAcceptances(userId);
        return NextResponse.json({ ok: true, acceptances });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!isUuid(userId)) {
            return NextResponse.json({ error: "Log in before recording legal acceptance." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(
            request,
            "/api/legal/acceptances",
            userId,
            getSessionTokensFromRecord(body),
        );
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const acceptances = parseAcceptances(body);
        const context = String(body.context || "").trim().toLowerCase();
        if (context === "signup") {
            const parsedAccountType = parseSignupAccountTypeInput(body.accountType);
            if (!parsedAccountType.ok) {
                return NextResponse.json({ error: parsedAccountType.error }, { status: 400 });
            }
            const recorded = await recordSignupLegalAcceptances({
                userId,
                accountType: parsedAccountType.accountType,
                acceptances,
            });
            if (!recorded.ok) {
                return NextResponse.json(
                    {
                        error: recorded.error,
                        ...("missing" in recorded ? { missing: recorded.missing } : {}),
                    },
                    { status: recorded.status },
                );
            }
            return NextResponse.json(recorded);
        }

        const recorded = await recordLegalAcceptances({ userId, acceptances });
        if (!recorded.ok) {
            return NextResponse.json({ error: recorded.error }, { status: recorded.status });
        }
        return NextResponse.json(recorded);
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
