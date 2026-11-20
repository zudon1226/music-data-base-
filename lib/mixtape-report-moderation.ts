import {
    canTransitionMixtapeReportStatus,
    isMixtapeReportStatus,
} from "@/lib/mixtape-report-status.mjs";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

const REPORT_SELECT_CORE = `
  id,
  mixtape_id,
  reporter_user_id,
  reason_code,
  details,
  status,
  created_at,
  updated_at,
  mixtapes (
    id,
    title,
    status,
    user_id
  )
`;

const REPORT_SELECT = `
  ${REPORT_SELECT_CORE.trim()},
  reviewed_by,
  reviewed_at
`;

function isMissingModerationAuditColumnError(error: unknown) {
    return /reviewed_by|reviewed_at|schema cache/i.test(getErrorMessage(error));
}

export type MixtapeReportRow = {
    id: string;
    mixtape_id: string;
    reporter_user_id: string;
    reason_code: string;
    details: string;
    status: string;
    created_at: string;
    updated_at: string;
    reviewed_by?: string | null;
    reviewed_at?: string | null;
    mixtapes?: {
        id: string;
        title: string;
        status: string;
        user_id: string;
    } | null;
};

async function attachProfileNames(reports: MixtapeReportRow[]) {
    const ids = new Set<string>();
    for (const report of reports) {
        if (report.reporter_user_id) ids.add(report.reporter_user_id);
        const ownerId = report.mixtapes?.user_id;
        if (ownerId) ids.add(ownerId);
    }
    if (ids.size === 0) return reports;

    const supabase = getSupabaseServerClient();
    const profileQuery = await supabase
        .from("profiles")
        .select("id,user_id,display_name,username,artist_name")
        .or([...ids].map((id) => `id.eq.${id},user_id.eq.${id}`).join(","));

    const nameById = new Map<string, string>();
    if (!profileQuery.error) {
        for (const profile of profileQuery.data || []) {
            const label = String(
                profile.display_name || profile.username || profile.artist_name || "",
            ).trim() || "Creator";
            if (profile.id) nameById.set(String(profile.id), label);
            if (profile.user_id) nameById.set(String(profile.user_id), label);
        }
    }

    return reports.map((report) => {
        const mixtape = report.mixtapes;
        const creatorUserId = mixtape?.user_id ? String(mixtape.user_id) : "";
        return {
            ...report,
            mixtapeTitle: mixtape?.title || "",
            mixtapeStatus: mixtape?.status || "",
            creatorUserId,
            creatorName: creatorUserId ? (nameById.get(creatorUserId) || "Creator") : "",
            reporterName: nameById.get(report.reporter_user_id) || "Reporter",
        };
    });
}

export async function listMixtapeReportsForModeration(options: { status?: string; limit?: number } = {}) {
    const supabase = getSupabaseServerClient();
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
    let query = supabase
        .from("mixtape_reports")
        .select(REPORT_SELECT)
        .order("created_at", { ascending: false })
        .limit(limit);
    const status = String(options.status || "").trim();
    if (status && isMixtapeReportStatus(status)) {
        query = query.eq("status", status);
    }
    let result = await query;
    if (result.error && isMissingModerationAuditColumnError(result.error)) {
        query = supabase
            .from("mixtape_reports")
            .select(REPORT_SELECT_CORE)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (status && isMixtapeReportStatus(status)) {
            query = query.eq("status", status);
        }
        result = await query;
    }
    if (result.error) {
        return { ok: false as const, error: getErrorMessage(result.error), reports: [] };
    }
    const enriched = await attachProfileNames((result.data || []) as MixtapeReportRow[]);
    return { ok: true as const, reports: enriched };
}

export async function getMixtapeReportForModeration(reportId: string) {
    if (!isUuid(reportId)) {
        return { ok: false as const, status: 400, error: "Invalid report id." };
    }
    const supabase = getSupabaseServerClient();
    let result = await supabase
        .from("mixtape_reports")
        .select(REPORT_SELECT)
        .eq("id", reportId)
        .maybeSingle();
    if (result.error && isMissingModerationAuditColumnError(result.error)) {
        result = await supabase
            .from("mixtape_reports")
            .select(REPORT_SELECT_CORE)
            .eq("id", reportId)
            .maybeSingle();
    }
    if (result.error) {
        return { ok: false as const, status: 500, error: getErrorMessage(result.error) };
    }
    if (!result.data) {
        return { ok: false as const, status: 404, error: "Mixtape report not found." };
    }
    const [report] = await attachProfileNames([result.data as MixtapeReportRow]);
    return { ok: true as const, report };
}

export async function updateMixtapeReportModerationStatus(
    reportId: string,
    nextStatus: string,
    moderatorUserId: string,
) {
    if (!isUuid(reportId)) {
        return { ok: false as const, status: 400, error: "Invalid report id." };
    }
    if (!isMixtapeReportStatus(nextStatus)) {
        return { ok: false as const, status: 400, error: "Invalid mixtape report status." };
    }

    const supabase = getSupabaseServerClient();
    const existing = await supabase
        .from("mixtape_reports")
        .select("id,mixtape_id,reporter_user_id,reason_code,details,status,created_at,updated_at,reviewed_by,reviewed_at")
        .eq("id", reportId)
        .maybeSingle();
    if (existing.error) {
        return { ok: false as const, status: 500, error: getErrorMessage(existing.error) };
    }
    if (!existing.data) {
        return { ok: false as const, status: 404, error: "Mixtape report not found." };
    }
    const fromStatus = String(existing.data.status || "");
    if (!canTransitionMixtapeReportStatus(fromStatus, nextStatus)) {
        return {
            ok: false as const,
            status: 409,
            error: `Cannot change report status from ${fromStatus} to ${nextStatus}.`,
            code: "INVALID_STATUS_TRANSITION",
        };
    }

    const reviewedAt = new Date().toISOString();
    let updated = await supabase
        .from("mixtape_reports")
        .update({
            status: nextStatus,
            reviewed_by: moderatorUserId,
            reviewed_at: reviewedAt,
        })
        .eq("id", reportId)
        .select(REPORT_SELECT)
        .maybeSingle();
    if (updated.error && /reviewed_by|reviewed_at|schema cache/i.test(getErrorMessage(updated.error))) {
        updated = await supabase
            .from("mixtape_reports")
            .update({ status: nextStatus })
            .eq("id", reportId)
            .select(REPORT_SELECT)
            .maybeSingle();
    }
    if (updated.error) {
        return { ok: false as const, status: 500, error: getErrorMessage(updated.error) };
    }
    if (!updated.data) {
        return { ok: false as const, status: 404, error: "Mixtape report not found." };
    }

    const preservedOwnership = String(updated.data.reporter_user_id) === String(existing.data.reporter_user_id)
        && String(updated.data.mixtape_id) === String(existing.data.mixtape_id)
        && String(updated.data.reason_code) === String(existing.data.reason_code)
        && String(updated.data.details) === String(existing.data.details)
        && String(updated.data.created_at) === String(existing.data.created_at);
    if (!preservedOwnership) {
        return { ok: false as const, status: 500, error: "Report metadata was altered unexpectedly." };
    }

    const [report] = await attachProfileNames([updated.data as MixtapeReportRow]);
    return { ok: true as const, report };
}

export { isMixtapeReportStatus, canTransitionMixtapeReportStatus };