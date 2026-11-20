import { NextResponse } from "next/server";
import { requireMixtapeReportModerator } from "@/lib/mixtape-report-moderation-auth";
import { listMixtapeReportsForModeration } from "@/lib/mixtape-report-moderation";
import { isMixtapeReportStatus } from "@/lib/mixtape-report-status.mjs";
import { getErrorMessage } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const status = url.searchParams.get("status")?.trim() || "";
        const limitParam = url.searchParams.get("limit")?.trim() || "";
        const auth = await requireMixtapeReportModerator(request, { userId }, "/api/mixtapes/reports/moderation");
        if (!auth.ok) return jsonResponse({ error: auth.error, reports: [] }, auth.status);
        if (status && !isMixtapeReportStatus(status)) {
            return jsonResponse({ error: "Invalid mixtape report status filter.", reports: [] }, 400);
        }
        const limit = limitParam ? Number(limitParam) : undefined;
        const result = await listMixtapeReportsForModeration({ status: status || undefined, limit });
        if (!result.ok) return jsonResponse({ error: result.error, reports: [] }, 500);
        return jsonResponse({ reports: result.reports });
    }
    catch (error) {
        console.error("[api/mixtapes/reports/moderation] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), reports: [] }, 500);
    }
}