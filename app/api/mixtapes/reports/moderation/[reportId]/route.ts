import { NextResponse } from "next/server";
import { requireMixtapeReportModerator } from "@/lib/mixtape-report-moderation-auth";
import {
    getMixtapeReportForModeration,
    updateMixtapeReportModerationStatus,
} from "@/lib/mixtape-report-moderation";
import { getErrorMessage } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, context: RouteContext) {
    try {
        const { reportId } = await context.params;
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        const auth = await requireMixtapeReportModerator(
            request,
            { userId },
            "/api/mixtapes/reports/moderation/[reportId]",
        );
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const result = await getMixtapeReportForModeration(reportId);
        if (!result.ok) return jsonResponse({ error: result.error }, result.status);
        return jsonResponse({ report: result.report });
    }
    catch (error) {
        console.error("[api/mixtapes/reports/moderation/[reportId]] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const { reportId } = await context.params;
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeReportModerator(
            request,
            body,
            "/api/mixtapes/reports/moderation/[reportId]",
        );
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const status = String(body.status || "").trim();
        const targetId = String(body.id || body.reportId || reportId || "").trim();
        const result = await updateMixtapeReportModerationStatus(targetId, status, auth.userId);
        if (!result.ok) {
            return jsonResponse(
                { error: result.error, code: "code" in result ? result.code : undefined },
                result.status,
            );
        }
        return jsonResponse({ ok: true, report: result.report });
    }
    catch (error) {
        console.error("[api/mixtapes/reports/moderation/[reportId]] PATCH failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}