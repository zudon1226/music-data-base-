import { NextResponse } from "next/server";
import { requirePlatformOwnerUserId } from "@/lib/admin-auth";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import type { TestAccountReviewLabel } from "@/lib/test-account-cleanup";
import {
    deleteTestAccount,
    listTestAccountReviewAccounts,
    runTestAccountDryRun,
    setTestAccountReviewLabel,
} from "@/lib/test-account-cleanup-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_LABELS = new Set<TestAccountReviewLabel>([
    "protected_real_user",
    "confirmed_test_account",
    "needs_review",
]);

async function authorizeOwner(request: Request, userId: string) {
    if (!userId || !isUuid(userId)) {
        return { ok: false as const, response: NextResponse.json({ error: "Platform owner session is required." }, { status: 401 }) };
    }
    const auth = await requireMatchingUserId(request, "/api/launch/test-account-cleanup", userId);
    if (!auth.ok) {
        return { ok: false as const, response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
    }
    const owner = await requirePlatformOwnerUserId(userId);
    if (!owner.ok) {
        return { ok: false as const, response: NextResponse.json({ error: owner.error }, { status: owner.status }) };
    }
    return { ok: true as const, userId };
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        const authorized = await authorizeOwner(request, userId);
        if (!authorized.ok) return authorized.response;

        const supabase = getSupabaseServerClient();
        const review = await listTestAccountReviewAccounts(supabase);
        return NextResponse.json({ ok: true, review });
    }
    catch (error) {
        console.error("[api/launch/test-account-cleanup] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        const tokens = getSessionTokensFromRecord(body);
        const auth = await requireMatchingUserId(request, "/api/launch/test-account-cleanup", userId, tokens);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const owner = await requirePlatformOwnerUserId(userId);
        if (!owner.ok) return NextResponse.json({ error: owner.error }, { status: owner.status });

        const action = typeof body.action === "string" ? body.action.trim() : "";
        const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
        if (!targetUserId || !isUuid(targetUserId)) {
            return NextResponse.json({ error: "A valid target user id is required." }, { status: 400 });
        }

        const supabase = getSupabaseServerClient();

        if (action === "dry-run") {
            const result = await runTestAccountDryRun(supabase, targetUserId, userId);
            return NextResponse.json({ ok: result.ok, result });
        }

        if (action === "delete") {
            const confirmed = body.confirmed === true;
            const confirmText = typeof body.confirmText === "string" ? body.confirmText.trim() : "";
            if (!confirmed || confirmText !== "DELETE") {
                return NextResponse.json({ error: "Deletion requires confirmation checkbox and typing DELETE." }, { status: 400 });
            }
            const result = await deleteTestAccount(supabase, targetUserId, userId);
            return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 409 });
        }

        if (action === "set-label") {
            const label = typeof body.label === "string" ? body.label.trim() : "";
            const notes = typeof body.notes === "string" ? body.notes.trim() : "";
            if (!REVIEW_LABELS.has(label as TestAccountReviewLabel)) {
                return NextResponse.json({ error: "A valid review label is required." }, { status: 400 });
            }
            const result = await setTestAccountReviewLabel(
                supabase,
                targetUserId,
                userId,
                label as TestAccountReviewLabel,
                notes,
            );
            return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 500 });
        }

        return NextResponse.json({ error: "Unsupported cleanup action." }, { status: 400 });
    }
    catch (error) {
        console.error("[api/launch/test-account-cleanup] POST error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
