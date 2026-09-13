import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import {
    mapTicketRowForAdmin,
    normalizeSupportSeverity,
    normalizeSupportStatus,
    redactSupportText,
    SUPPORT_TICKET_ADMIN_SELECT,
} from "@/lib/support-tickets";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function requireAdminRequest(request: Request, userId: string, body?: Record<string, unknown>) {
    if (!isUuid(userId)) {
        return { ok: false as const, status: 401 as const, error: "Authentication required." };
    }
    const auth = await requireMatchingUserId(
        request,
        "/api/admin/support/tickets",
        userId,
        body ? getSessionTokensFromRecord(body) : undefined,
    );
    if (!auth.ok) return auth;
    if (!(await isAdminUserId(auth.userId))) {
        return { ok: false as const, status: 403 as const, error: "Admin permission is required." };
    }
    return { ok: true as const, userId: auth.userId };
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const auth = await requireAdminRequest(request, userId);
        if (!auth.ok) return jsonResponse({ error: auth.error, tickets: [] }, auth.status);

        const supabase = getSupabaseServerClient();
        let query = supabase
            .from("support_tickets")
            .select(SUPPORT_TICKET_ADMIN_SELECT)
            .order("created_at", { ascending: false })
            .limit(200);

        const status = url.searchParams.get("status")?.trim();
        const category = url.searchParams.get("category")?.trim();
        const accountType = url.searchParams.get("accountType")?.trim();
        const deviceType = url.searchParams.get("deviceType")?.trim();
        const severity = url.searchParams.get("severity")?.trim();

        if (status) query = query.eq("status", status);
        if (category) query = query.eq("category", category);
        if (accountType) query = query.eq("account_type", accountType);
        if (deviceType) query = query.eq("device_type", deviceType);
        if (severity) query = query.eq("severity", severity);

        const { data, error } = await query;
        if (error) return jsonResponse({ error: getErrorMessage(error), tickets: [] }, 500);

        return jsonResponse({ tickets: (data || []).map((row) => mapTicketRowForAdmin(row as Record<string, unknown>)) });
    }
    catch (error) {
        console.error("[api/admin/support/tickets] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), tickets: [] }, 500);
    }
}

export async function PATCH(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || body.user_id || "").trim();
        const auth = await requireAdminRequest(request, userId, body);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

        const ticketId = String(body.id || body.ticketId || "").trim();
        if (!isUuid(ticketId)) return jsonResponse({ error: "Ticket id is required." }, 400);

        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.status !== undefined) {
            const status = normalizeSupportStatus(body.status);
            if (!status) return jsonResponse({ error: "Invalid status." }, 400);
            patch.status = status;
            if (status === "fixed" || status === "closed") {
                patch.resolved_at = new Date().toISOString();
            }
        }
        if (body.severity !== undefined) {
            patch.severity = normalizeSupportSeverity(body.severity);
            patch.priority = patch.severity;
        }
        if (body.adminNotes !== undefined || body.admin_notes !== undefined) {
            patch.admin_notes = redactSupportText(body.adminNotes ?? body.admin_notes, 8000) || null;
        }

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("support_tickets")
            .update(patch)
            .eq("id", ticketId)
            .select(SUPPORT_TICKET_ADMIN_SELECT)
            .maybeSingle();

        if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
        if (!data) return jsonResponse({ error: "Ticket not found." }, 404);

        return jsonResponse({ ok: true, ticket: mapTicketRowForAdmin(data as Record<string, unknown>) });
    }
    catch (error) {
        console.error("[api/admin/support/tickets] PATCH failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
