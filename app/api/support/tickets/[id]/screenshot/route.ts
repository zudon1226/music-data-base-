import { NextResponse } from "next/server";
import { getBearerToken, requireMatchingUserId } from "@/lib/request-auth";
import { createSupportAuthenticatedClient } from "@/lib/support-authenticated-client";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { isAdminUserId } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const { id: ticketId } = await context.params;
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!isUuid(ticketId) || !isUuid(userId)) {
            return jsonResponse({ error: "Invalid ticket request." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/support/tickets/[id]/screenshot", userId);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const accessToken = getBearerToken(request);
        if (!accessToken) return jsonResponse({ error: "Missing or invalid Authorization bearer token." }, 401);

        const supabase = createSupportAuthenticatedClient(accessToken);
        const { data: ticket, error } = await supabase
            .from("support_tickets")
            .select("id,user_id,screenshot_path")
            .eq("id", ticketId)
            .maybeSingle();

        if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
        if (!ticket?.screenshot_path) return jsonResponse({ error: "No screenshot for this ticket." }, 404);

        const isOwner = ticket.user_id === auth.userId;
        const isAdmin = await isAdminUserId(auth.userId);
        if (!isOwner && !isAdmin) return jsonResponse({ error: "Not allowed." }, 403);

        const service = getSupabaseServerClient();
        const signed = await service.storage
            .from("support-attachments")
            .createSignedUrl(String(ticket.screenshot_path), 120);
        if (signed.error || !signed.data?.signedUrl) {
            return jsonResponse({ error: getErrorMessage(signed.error) || "Could not sign screenshot URL." }, 500);
        }
        return jsonResponse({ url: signed.data.signedUrl });
    }
    catch (error) {
        console.error("[api/support/tickets/screenshot] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
