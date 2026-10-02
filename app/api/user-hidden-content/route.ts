import { NextResponse } from "next/server";
import { getBearerToken, getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { createTrustAuthenticatedClient } from "@/lib/trust-authenticated-client";
import { isUserHiddenContentType } from "@/lib/user-hidden-content-types";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function requireTrustUser(request: Request, userId: string, body?: Record<string, unknown>) {
    if (!isUuid(userId)) {
        return { ok: false as const, status: 401 as const, error: "Sign in to manage hidden content." };
    }
    const auth = await requireMatchingUserId(
        request,
        "/api/user-hidden-content",
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
        if (!auth.ok) return json({ error: auth.error, hidden: [] }, auth.status);

        const supabase = createTrustAuthenticatedClient(auth.accessToken);
        const { data, error } = await supabase
            .from("user_hidden_content")
            .select("id,content_type,content_id,created_at")
            .eq("user_id", auth.userId)
            .order("created_at", { ascending: false })
            .limit(500);
        if (error) {
            const message = getErrorMessage(error).toLowerCase();
            if (message.includes("does not exist") || message.includes("schema cache")) {
                return json({ hidden: [], setupRequired: true });
            }
            return json({ error: getErrorMessage(error), hidden: [] }, 500);
        }
        return json({ hidden: data || [] });
    }
    catch (error) {
        console.error("[api/user-hidden-content] GET failed:", error);
        return json({ error: getErrorMessage(error), hidden: [] }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || body.user_id || "").trim();
        const auth = await requireTrustUser(request, userId, body);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const contentType = String(body.contentType || body.content_type || "").trim();
        const contentId = String(body.contentId || body.content_id || "").trim();
        if (!isUserHiddenContentType(contentType)) {
            return json({ error: "Invalid content type." }, 400);
        }
        if (!contentId) {
            return json({ error: "Content id is required." }, 400);
        }

        const supabase = createTrustAuthenticatedClient(auth.accessToken);
        const inserted = await supabase
            .from("user_hidden_content")
            .insert({
                user_id: auth.userId,
                content_type: contentType,
                content_id: contentId.slice(0, 120),
            })
            .select("id,content_type,content_id,created_at")
            .single();
        if (inserted.error) {
            const message = getErrorMessage(inserted.error).toLowerCase();
            if (message.includes("duplicate") || message.includes("unique")) {
                return json({ ok: true, hidden: { content_type: contentType, content_id: contentId } });
            }
            if (message.includes("does not exist") || message.includes("schema cache")) {
                return json({ error: "Hidden content is not available until setup is applied.", setupRequired: true }, 409);
            }
            return json({ error: getErrorMessage(inserted.error) }, 500);
        }
        return json({ ok: true, hidden: inserted.data }, 201);
    }
    catch (error) {
        console.error("[api/user-hidden-content] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function DELETE(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || body.user_id || "").trim();
        const auth = await requireTrustUser(request, userId, body);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const contentType = String(body.contentType || body.content_type || "").trim();
        const contentId = String(body.contentId || body.content_id || "").trim();
        const rowId = String(body.id || "").trim();

        const supabase = createTrustAuthenticatedClient(auth.accessToken);
        let query = supabase.from("user_hidden_content").delete().eq("user_id", auth.userId);
        if (rowId && isUuid(rowId)) {
            query = query.eq("id", rowId);
        }
        else if (isUserHiddenContentType(contentType) && contentId) {
            query = query.eq("content_type", contentType).eq("content_id", contentId.slice(0, 120));
        }
        else {
            return json({ error: "Hidden content id or type/id pair is required." }, 400);
        }

        const { error } = await query;
        if (error) return json({ error: getErrorMessage(error) }, 500);
        return json({ ok: true });
    }
    catch (error) {
        console.error("[api/user-hidden-content] DELETE failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
