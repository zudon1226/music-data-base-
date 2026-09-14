import { NextResponse } from "next/server";
import { deleteAuthenticatedUserAccount } from "@/lib/account-deletion-service";
import { getSessionTokensFromRecord, resolveStrictRequestUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM_TEXT = "DELETE";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const tokens = getSessionTokensFromRecord(body);
        const resolved = await resolveStrictRequestUserId(request, tokens);
        if (!resolved.userId) {
            return json({ error: "Sign in to delete your account." }, 401);
        }

        if (body.confirmed !== true) {
            return json({ error: "Deletion requires explicit confirmation." }, 400);
        }
        const confirmText = typeof body.confirmText === "string" ? body.confirmText.trim() : "";
        if (confirmText !== CONFIRM_TEXT) {
            return json({ error: `Type ${CONFIRM_TEXT} to confirm account deletion.` }, 400);
        }

        const claimedUserId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (claimedUserId && claimedUserId !== resolved.userId) {
            return json({ error: "You may only delete your own account." }, 403);
        }

        const supabase = getSupabaseServerClient();
        const result = await deleteAuthenticatedUserAccount(supabase, resolved.userId);
        if (!result.ok) {
            return json({ error: result.error, code: result.code }, result.status);
        }

        return json({ ok: true, message: result.message, deleted: true });
    }
    catch (error) {
        console.error("[api/account/delete] error:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
