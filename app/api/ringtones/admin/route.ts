import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import {
    performRingtoneAdminAction,
    type RingtoneAdminAction,
} from "@/lib/ringtone-moderation";
import { isRingtoneStatus } from "@/lib/ringtone-validation";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

const ADMIN_ACTIONS = new Set<RingtoneAdminAction>([
    "approve",
    "reject",
    "publish",
    "suspend",
    "restore",
    "archive",
    "reprocess",
    "feature",
    "unfeature",
]);

/** Owner/admin Ringtone Review Queue with filters, jobs, and moderation context. */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/admin", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        const statusFilter = url.searchParams.get("status")?.trim() || "";
        const sort = url.searchParams.get("sort")?.trim() || "oldest";
        const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

        const supabase = getSupabaseServerClient();
        let query = supabase.from("ringtone_products").select("*").limit(300);

        if (statusFilter === "processing_failed") {
            query = query.neq("last_processing_error_code", "");
        } else if (statusFilter && isRingtoneStatus(statusFilter)) {
            query = query.eq("status", statusFilter);
        } else if (statusFilter === "pending_review") {
            query = query.eq("status", "pending_review");
        }

        if (sort === "newest") query = query.order("updated_at", { ascending: false });
        else if (sort === "title") query = query.order("title", { ascending: true });
        else if (sort === "status") query = query.order("status", { ascending: true });
        else if (sort === "creator") query = query.order("creator_id", { ascending: true });
        else query = query.order("updated_at", { ascending: true });

        const [products, purchases, jobs, logs] = await Promise.all([
            query,
            supabase.from("ringtone_purchases").select("*").order("purchased_at", { ascending: false }).limit(200),
            supabase.from("ringtone_processing_jobs").select("*").order("created_at", { ascending: false }).limit(400),
            supabase.from("ringtone_moderation_logs").select("*").order("created_at", { ascending: false }).limit(400),
        ]);
        if (products.error) return json({ error: getErrorMessage(products.error) }, 500);
        if (purchases.error) return json({ error: getErrorMessage(purchases.error) }, 500);

        const jobByRingtone = new Map<string, Record<string, unknown>>();
        for (const job of jobs.data || []) {
            const key = String(job.ringtone_id);
            if (!jobByRingtone.has(key)) jobByRingtone.set(key, job);
        }

        let ringtones = (products.data || []).map((row) => ({
            ...row,
            latestJob: jobByRingtone.get(String(row.id)) || null,
        }));

        if (q) {
            ringtones = ringtones.filter((row) => {
                const hay = `${row.title || ""} ${row.creator_id || ""} ${row.source_kind || ""}`.toLowerCase();
                return hay.includes(q);
            });
        }

        const creatorIds = [...new Set(ringtones.map((r) => String(r.creator_id)).filter(Boolean))];
        const profiles = creatorIds.length
            ? await supabase.from("profiles").select("id,user_id,display_name,username").in("user_id", creatorIds)
            : { data: [], error: null };
        const profileByUser = new Map<string, Record<string, unknown>>();
        for (const profile of profiles.data || []) {
            if (profile.user_id) profileByUser.set(String(profile.user_id), profile);
            if (profile.id) profileByUser.set(String(profile.id), profile);
        }

        const enriched = ringtones.map((row) => {
            const profile = profileByUser.get(String(row.creator_id));
            return {
                ...row,
                creatorLabel: String(profile?.display_name || profile?.username || row.creator_id || "Creator"),
                processingResult: row.latestJob || null,
                iphoneReady: Boolean(row.iphone_storage_path),
                androidReady: Boolean(row.android_storage_path),
                previewReady: Boolean(row.preview_storage_path || row.preview_url),
            };
        });

        return json({
            ringtones: enriched,
            purchases: purchases.data || [],
            moderationLogs: logs.data || [],
            jobs: jobs.data || [],
        });
    } catch (error) {
        console.error("[api/ringtones/admin] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

/** Approve, reject, publish, suspend, restore, archive, or reprocess. */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        const ringtoneId = String(body.ringtoneId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        if (!ringtoneId || !isUuid(ringtoneId)) return json({ error: "ringtoneId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/admin", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        const actionRaw = String(body.action || "").trim().toLowerCase();
        let action = actionRaw as RingtoneAdminAction;

        // Backward-compatible status mapping when action is omitted.
        if (!action && body.status != null && isRingtoneStatus(body.status)) {
            const status = String(body.status);
            if (status === "approved") action = "approve";
            else if (status === "rejected") action = "reject";
            else if (status === "published") action = "publish";
            else if (status === "suspended") action = "suspend";
            else if (status === "archived") action = "archive";
        }

        if (body.isFeatured === true && !action) action = "feature";
        if (body.isFeatured === false && !action) action = "unfeature";

        if (!ADMIN_ACTIONS.has(action)) {
            return json({ error: "Unsupported admin action.", code: "UNSUPPORTED_ACTION" }, 400);
        }

        const result = await performRingtoneAdminAction({
            ringtoneId,
            actorId: userId,
            action,
            reason: body.reason != null ? String(body.reason) : String(body.reviewNotes || ""),
            isFeatured: body.isFeatured === true,
        });

        if (!result.ok) {
            return json({
                error: result.error,
                code: "code" in result ? result.code : undefined,
            }, result.status || 400);
        }

        return json({
            ringtone: result.ringtone,
            job: "job" in result ? result.job : null,
            idempotent: Boolean(result.idempotent),
            action,
        });
    } catch (error) {
        console.error("[api/ringtones/admin] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
