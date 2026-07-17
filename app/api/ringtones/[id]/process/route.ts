import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { requireRingtoneCreator } from "@/lib/ringtone-access";
import {
    enqueueRingtoneProcessingJob,
    getLatestRingtoneJob,
    queueAndRunRingtoneProcessing,
} from "@/lib/ringtone-jobs";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Clip encode (15–30s) needs headroom for ffmpeg-static on Fluid compute. */
export const maxDuration = 60;

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

/** Latest processing job for a ringtone (creator or admin). */
export async function GET(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]/process", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const latest = await getLatestRingtoneJob(id);
        if (!latest.ok) return json({ error: latest.error }, 500);
        if (!latest.job) return json({ job: null });

        const isAdmin = await isAdminUserId(userId);
        if (!isAdmin && String(latest.job.creator_id) !== userId) {
            return json({ error: "Forbidden." }, 403);
        }
        return json({ job: latest.job });
    } catch (error) {
        console.error("[api/ringtones/:id/process] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

/**
 * Queue and run secure server-side processing.
 * Creators submit draft/rejected products; admins may request reprocessing.
 */
export async function POST(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]/process", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const isAdmin = await isAdminUserId(userId);
        if (!isAdmin) {
            const creator = await requireRingtoneCreator(userId);
            if (!creator.ok) return json({ error: creator.error }, creator.status);
        }

        const queueOnly = body.queueOnly === true;
        const forceRetry = body.retry === true || body.forceRetry === true || isAdmin;

        if (queueOnly) {
            const queued = await enqueueRingtoneProcessingJob({
                ringtoneId: id,
                actorId: userId,
                actorRole: isAdmin ? "admin" : "creator",
                forceRetry,
            });
            if (!queued.ok) return json({ error: queued.error, code: queued.code }, queued.status || 400);
            return json({
                job: queued.job,
                ringtone: queued.ringtone,
                duplicate: queued.duplicate,
                created: queued.created,
            });
        }

        const ran = await queueAndRunRingtoneProcessing({
            ringtoneId: id,
            actorId: userId,
            actorRole: isAdmin ? "admin" : "creator",
            forceRetry,
        });
        if (!ran.ok) {
            return json({
                error: ran.error,
                code: ran.code,
                job: "job" in ran ? ran.job : null,
            }, ran.status || 422);
        }
        return json({
            job: ran.job,
            ringtone: ran.ringtone,
            duplicate: ran.duplicate,
            revision: ran.revision || null,
        });
    } catch (error) {
        console.error("[api/ringtones/:id/process] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
