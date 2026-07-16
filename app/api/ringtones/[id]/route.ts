import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { requireRingtoneCreator } from "@/lib/ringtone-access";
import { type RingtoneStatus } from "@/lib/ringtone-constants";
import {
    canAdminTransitionStatus,
    canCreatorTransitionStatus,
    isPublicRingtoneStatus,
    isRingtoneStatus,
    sanitizeRingtoneText,
    validateRingtoneClip,
    validateRingtonePriceCents,
    normalizeRingtoneCurrency,
} from "@/lib/ringtone-validation";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("ringtone_products")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (error) return json({ error: getErrorMessage(error) }, 500);
        if (!data) return json({ error: "Ringtone not found." }, 404);

        const status = String(data.status || "") as RingtoneStatus;
        if (isPublicRingtoneStatus(status)) {
            return json({ ringtone: data });
        }

        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "Ringtone not found." }, 404);
        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]", userId);
        if (!auth.ok) return json({ error: "Ringtone not found." }, 404);
        if (data.creator_id !== userId && !(await isAdminUserId(userId))) {
            return json({ error: "Ringtone not found." }, 404);
        }
        return json({ ringtone: data });
    } catch (error) {
        console.error("[api/ringtones/:id] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function PATCH(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        const existing = await supabase.from("ringtone_products").select("*").eq("id", id).maybeSingle();
        if (existing.error) return json({ error: getErrorMessage(existing.error) }, 500);
        if (!existing.data) return json({ error: "Ringtone not found." }, 404);

        const isAdmin = await isAdminUserId(userId);
        if (existing.data.creator_id !== userId && !isAdmin) {
            return json({ error: "You may only manage your own ringtone records." }, 403);
        }
        if (!isAdmin) {
            const creator = await requireRingtoneCreator(userId);
            if (!creator.ok) return json({ error: creator.error }, creator.status);
        }

        const currentStatus = String(existing.data.status || "draft") as RingtoneStatus;
        const updates: Record<string, unknown> = {};

        if (body.title != null) {
            const title = sanitizeRingtoneText(body.title, 160);
            if (!title) return json({ error: "Title is required." }, 400);
            updates.title = title;
        }
        if (body.description != null) {
            updates.description = sanitizeRingtoneText(body.description, 4000);
        }
        if (body.priceCents != null) {
            const price = validateRingtonePriceCents(body.priceCents);
            if (!price.ok) return json({ error: price.error }, 400);
            updates.price_cents = price.priceCents;
        }
        if (body.currency != null) {
            const currency = normalizeRingtoneCurrency(body.currency);
            if (!currency) return json({ error: "Unsupported currency." }, 400);
            updates.currency = currency;
        }
        if (body.isExplicit != null) updates.is_explicit = body.isExplicit === true;

        if (
            body.clipStartSeconds != null
            || body.durationSeconds != null
            || body.clipEndSeconds != null
        ) {
            const clip = validateRingtoneClip({
                clipStartSeconds: Number(body.clipStartSeconds ?? existing.data.clip_start_seconds),
                durationSeconds: body.durationSeconds == null
                    ? Number(existing.data.duration_seconds)
                    : Number(body.durationSeconds),
                clipEndSeconds: body.clipEndSeconds == null
                    ? undefined
                    : Number(body.clipEndSeconds),
                sourceDurationSeconds: body.sourceDurationSeconds == null
                    ? null
                    : Number(body.sourceDurationSeconds),
            });
            if (!clip.ok) return json({ error: clip.error }, 400);
            updates.clip_start_seconds = clip.clipStartSeconds;
            updates.clip_end_seconds = clip.clipEndSeconds;
            updates.duration_seconds = clip.durationSeconds;
        }

        if (body.status != null) {
            if (!isRingtoneStatus(body.status)) return json({ error: "Invalid status." }, 400);
            const nextStatus = body.status as RingtoneStatus;
            if (isAdmin) {
                if (!canAdminTransitionStatus(currentStatus, nextStatus)) {
                    return json({ error: `Invalid admin status transition ${currentStatus} -> ${nextStatus}.` }, 400);
                }
            } else if (!canCreatorTransitionStatus(currentStatus, nextStatus)) {
                return json({ error: `Creators cannot transition status from ${currentStatus} to ${nextStatus}.` }, 403);
            }
            updates.status = nextStatus;
            if (nextStatus === "published") updates.published_at = new Date().toISOString();
        }

        if (!isAdmin && ["approved", "published", "suspended", "archived"].includes(currentStatus)) {
            return json({ error: "This ringtone is locked for creator edits." }, 403);
        }

        if (Object.keys(updates).length === 0) {
            return json({ ringtone: existing.data });
        }

        const { data, error } = await supabase
            .from("ringtone_products")
            .update(updates)
            .eq("id", id)
            .select("*")
            .single();
        if (error) return json({ error: getErrorMessage(error) }, 500);
        return json({ ringtone: data });
    } catch (error) {
        console.error("[api/ringtones/:id] PATCH failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function DELETE(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid ringtone id." }, 400);
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/[id]", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const supabase = getSupabaseServerClient();
        const existing = await supabase.from("ringtone_products").select("id,creator_id,status").eq("id", id).maybeSingle();
        if (existing.error) return json({ error: getErrorMessage(existing.error) }, 500);
        if (!existing.data) return json({ error: "Ringtone not found." }, 404);

        const isAdmin = await isAdminUserId(userId);
        if (existing.data.creator_id !== userId && !isAdmin) {
            return json({ error: "You may only delete your own ringtone drafts." }, 403);
        }
        if (!isAdmin && !["draft", "rejected", "archived"].includes(String(existing.data.status))) {
            return json({ error: "Only draft, rejected, or archived ringtones may be deleted by creators." }, 403);
        }

        const { error } = await supabase.from("ringtone_products").delete().eq("id", id);
        if (error) return json({ error: getErrorMessage(error) }, 500);
        return json({ deleted: true, id });
    } catch (error) {
        console.error("[api/ringtones/:id] DELETE failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
