import { NextResponse } from "next/server";
import { assertOwnsSourceSong, requireRingtoneCreator } from "@/lib/ringtone-access";
import { PUBLIC_RINGTONE_STATUSES } from "@/lib/ringtone-constants";
import { buildCreateRingtonePayload, normalizeRingtoneSourceDurationSeconds } from "@/lib/ringtone-validation";
import { logRouteAuth, optionalMatchingUserId, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Public catalog + optional creator-owned drafts when authenticated as creator. */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const mine = url.searchParams.get("mine") === "1";
        const supabase = getSupabaseServerClient();

        if (mine) {
            if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
            const auth = await requireMatchingUserId(request, "/api/ringtones", userId);
            if (!auth.ok) return json({ error: auth.error }, auth.status);
            const creator = await requireRingtoneCreator(userId);
            if (!creator.ok) return json({ error: creator.error }, creator.status);

            const { data, error } = await supabase
                .from("ringtone_products")
                .select("*")
                .eq("creator_id", userId)
                .order("updated_at", { ascending: false });
            if (error) return json({ error: getErrorMessage(error) }, 500);
            return json({ ringtones: data || [] });
        }

        if (userId) {
            await optionalMatchingUserId(request, userId, { route: "/api/ringtones" });
        }

        const { data, error } = await supabase
            .from("ringtone_products")
            .select("id,creator_id,title,description,artwork_url,preview_url,duration_seconds,price_cents,currency,status,is_featured,is_explicit,published_at,created_at")
            .in("status", [...PUBLIC_RINGTONE_STATUSES])
            .order("published_at", { ascending: false, nullsFirst: false });
        if (error) return json({ error: getErrorMessage(error) }, 500);
        return json({ ringtones: data || [] });
    } catch (error) {
        console.error("[api/ringtones] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

/** Create a draft ringtone from an owned song or ringtone-only upload metadata. */
export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);

        const auth = await requireMatchingUserId(request, "/api/ringtones", userId);
        logRouteAuth(request, "/api/ringtones", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const creator = await requireRingtoneCreator(userId);
        if (!creator.ok) return json({ error: creator.error }, creator.status);

        // Create always stores draft. Submit-for-review runs through /process after save.
        const mode = body.submitForReview === true ? "submit" as const : "draft" as const;

        const fromBody = normalizeRingtoneSourceDurationSeconds(body.sourceDurationSeconds);
        let sourceDurationSeconds: number | null = fromBody;
        const sourceSongId = String(body.sourceSongId || "").trim();
        if (String(body.sourceKind || "") === "owned_song" && sourceSongId) {
            const ownership = await assertOwnsSourceSong(userId, sourceSongId);
            if (!ownership.ok) return json({ error: ownership.error, code: "SOURCE_NOT_AUTHORIZED" }, 403);
            // Trusted catalog duration wins when present; never overwrite with 0/null from Number(null).
            if (ownership.sourceDurationSeconds != null) {
                sourceDurationSeconds = ownership.sourceDurationSeconds;
            }
        }

        const built = buildCreateRingtonePayload({
            creatorId: userId,
            title: body.title,
            description: body.description,
            sourceKind: body.sourceKind,
            sourceSongId: body.sourceSongId,
            ownershipConfirmed: body.ownershipConfirmed,
            clipStartSeconds: body.clipStartSeconds,
            durationSeconds: body.durationSeconds,
            clipEndSeconds: body.clipEndSeconds,
            sourceDurationSeconds,
            priceCents: body.priceCents,
            currency: body.currency,
            isExplicit: body.isExplicit,
            artworkUrl: body.artworkUrl,
            sourceStoragePath: body.sourceStoragePath,
            iphoneAvailable: body.iphoneAvailable,
            androidAvailable: body.androidAvailable,
        }, { mode });
        if (!built.ok) return json({ error: built.error, code: "VALIDATION_FAILED" }, 400);

        // Never publish or pending_review on create — processing owns that transition.
        const row = { ...built.row, status: "draft" as const };

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("ringtone_products")
            .insert(row)
            .select("*")
            .single();
        if (error) {
            console.error("[api/ringtones] POST insert failed:", getErrorMessage(error));
            return json({ error: getErrorMessage(error), code: "DB_REJECTED" }, 500);
        }
        return json({ ringtone: data }, 201);
    } catch (error) {
        console.error("[api/ringtones] POST failed:", error);
        return json({ error: getErrorMessage(error), code: "SERVER_ERROR" }, 500);
    }
}
