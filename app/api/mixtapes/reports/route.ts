import { NextResponse } from "next/server";
import { requireMixtapeRequestUser } from "@/lib/mixtape-route-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestUser(request, body, "/api/mixtapes/reports");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const mixtapeId = String(body.mixtapeId || body.mixtape_id || "").trim();
        if (!isUuid(mixtapeId)) return jsonResponse({ error: "Invalid mixtape id." }, 400);
        const reasonCode = cleanText(body.reasonCode || body.reason_code || "other", 80) || "other";
        const details = cleanText(body.details, 4000);
        const supabase = getSupabaseServerClient();
        const mixtape = await supabase
            .from("mixtapes")
            .select("id,status")
            .eq("id", mixtapeId)
            .maybeSingle();
        if (mixtape.error) return jsonResponse({ error: getErrorMessage(mixtape.error) }, 500);
        if (!mixtape.data) return jsonResponse({ error: "Mixtape not found." }, 404);

        const inserted = await supabase
            .from("mixtape_reports")
            .insert({
                mixtape_id: mixtapeId,
                reporter_user_id: auth.userId,
                reason_code: reasonCode,
                details,
                status: "open",
            })
            .select("id,status,created_at")
            .single();
        if (inserted.error) return jsonResponse({ error: getErrorMessage(inserted.error) }, 500);
        return jsonResponse({ ok: true, report: inserted.data }, 201);
    }
    catch (error) {
        console.error("[api/mixtapes/reports] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}