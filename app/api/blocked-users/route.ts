import { NextResponse } from "next/server";
import { getBearerToken, getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { createTrustAuthenticatedClient } from "@/lib/trust-authenticated-client";
import { normalizeBlockedUserId } from "@/lib/user-block-enforcement";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function requireTrustUser(request: Request, userId: string, body?: Record<string, unknown>) {
    if (!isUuid(userId)) {
        return { ok: false as const, status: 401 as const, error: "Sign in to manage blocked users." };
    }
    const auth = await requireMatchingUserId(
        request,
        "/api/blocked-users",
        userId,
        body ? getSessionTokensFromRecord(body) : undefined,
    );
    if (!auth.ok) return auth;
    const accessToken = getBearerToken(request);
    if (!accessToken) {
        return { ok: false as const, status: 401 as const, error: "Missing or invalid Authorization bearer token." };
    }
    return { ok: true as const, userId: auth.userId, accessToken };
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        const auth = await requireTrustUser(request, userId);
        if (!auth.ok) return json({ error: auth.error, blocks: [] }, auth.status);

        const supabase = createTrustAuthenticatedClient(auth.accessToken);
        const { data, error } = await supabase
            .from("blocked_users")
            .select("id,blocker_id,blocked_user_id,blocked_user_name,reason,created_at")
            .eq("blocker_id", auth.userId)
            .order("created_at", { ascending: false })
            .limit(100);
        if (error) return json({ error: getErrorMessage(error), blocks: [] }, 500);
        return json({ blocks: data || [] });
    }
    catch (error) {
        console.error("[api/blocked-users] GET failed:", error);
        return json({ error: getErrorMessage(error), blocks: [] }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || body.user_id || "").trim();
        const auth = await requireTrustUser(request, userId, body);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const blockedUserId = normalizeBlockedUserId(body.blockedUserId ?? body.blocked_user_id);
        if (!blockedUserId) {
            return json({ error: "A valid blocked user id is required." }, 400);
        }
        if (blockedUserId === auth.userId) {
            return json({ error: "You cannot block your own account." }, 400);
        }

        const blockedUserName = String(body.blockedUserName || body.blocked_user_name || "Blocked user").trim().slice(0, 120);
        const reason = String(body.reason || "Blocked from Music Data Base").trim().slice(0, 500);

        const supabase = createTrustAuthenticatedClient(auth.accessToken);
        const inserted = await supabase
            .from("blocked_users")
            .insert({
                blocker_id: auth.userId,
                blocked_user_id: blockedUserId,
                blocked_user_name: blockedUserName,
                reason,
            })
            .select("id,blocker_id,blocked_user_id,blocked_user_name,reason,created_at")
            .single();
        if (inserted.error) {
            const message = getErrorMessage(inserted.error).toLowerCase();
            if (message.includes("duplicate") || message.includes("unique")) {
                return json({ error: "This user is already blocked." }, 409);
            }
            return json({ error: getErrorMessage(inserted.error) }, 500);
        }
        return json({ ok: true, block: inserted.data }, 201);
    }
    catch (error) {
        console.error("[api/blocked-users] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function DELETE(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || body.user_id || "").trim();
        const auth = await requireTrustUser(request, userId, body);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const blockId = String(body.id || body.blockId || "").trim();
        const blockedUserId = normalizeBlockedUserId(body.blockedUserId ?? body.blocked_user_id);

        const supabase = createTrustAuthenticatedClient(auth.accessToken);
        let query = supabase.from("blocked_users").delete().eq("blocker_id", auth.userId);
        if (blockId && isUuid(blockId)) {
            query = query.eq("id", blockId);
        }
        else if (blockedUserId) {
            query = query.eq("blocked_user_id", blockedUserId);
        }
        else {
            return json({ error: "Block id or blocked user id is required." }, 400);
        }

        const { error } = await query;
        if (error) return json({ error: getErrorMessage(error) }, 500);
        return json({ ok: true });
    }
    catch (error) {
        console.error("[api/blocked-users] DELETE failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
