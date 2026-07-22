import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { resolveSongPlayableUrl } from "@/lib/desktop-media-queue";
import { requireRingtoneCreator } from "@/lib/ringtone-access";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function parseDurationSeconds(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const asNumber = Number(value);
        if (Number.isFinite(asNumber)) return asNumber;
        const parts = value.trim().split(":").map((part) => Number(part));
        if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
            return parts[0] * 60 + parts[1];
        }
        if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
    }
    return 0;
}

/** Eligible platform songs for ringtone source selection (owned for creators, catalog for admin). */
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/source-songs", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const creator = await requireRingtoneCreator(userId);
        if (!creator.ok) return json({ error: creator.error }, creator.status);

        const isAdmin = await isAdminUserId(userId);
        const supabase = getSupabaseServerClient();
        // Canonical catalog table used by Library/player: public.songs
        // Ownership field used elsewhere for uploads: songs.user_id (plus producer_id credit).
        // Songs store length in `duration` only (no seconds twin column on this table).
        let query = supabase
            .from("songs")
            .select("id,title,artist,cover_url,audio_url,storage_path,duration,created_at,user_id,producer_id")
            .order("created_at", { ascending: false })
            .limit(isAdmin ? 500 : 200);

        if (!isAdmin) {
            query = query.or(`user_id.eq.${userId},producer_id.eq.${userId}`);
        }

        const { data, error } = await query;
        if (error) {
            console.error("[api/ringtones/source-songs] query failed", {
                userId,
                isAdmin,
                code: (error as { code?: string }).code || "",
                message: getErrorMessage(error),
            });
            return json({ error: getErrorMessage(error) }, 500);
        }

        const excluded = {
            noPlayableAudio: 0,
            knownTooShort: 0,
        };
        const songs = [];
        for (const row of data || []) {
            const record = row as Record<string, unknown>;
            const resolved = resolveSongPlayableUrl(record);
            if (!resolved.playableUrl && !resolved.storagePath) {
                excluded.noPlayableAudio += 1;
                continue;
            }
            const durationSeconds = parseDurationSeconds(record.duration);
            // Keep songs with unknown duration; only drop known sub-15s sources.
            if (durationSeconds > 0 && durationSeconds < 15) {
                excluded.knownTooShort += 1;
                continue;
            }
            songs.push({
                id: String(record.id || ""),
                title: String(record.title || ""),
                artist: String(record.artist || ""),
                artworkUrl: String(record.cover_url || ""),
                audioUrl: resolved.playableUrl || String(record.audio_url || ""),
                storagePath: resolved.storagePath || String(record.storage_path || ""),
                durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
                createdAt: record.created_at ? String(record.created_at) : null,
                ownerUserId: record.user_id ? String(record.user_id) : "",
                producerId: record.producer_id ? String(record.producer_id) : "",
            });
        }

        console.info("[api/ringtones/source-songs]", {
            userId,
            isAdmin,
            rawQueryResultCount: (data || []).length,
            eligibleResultCount: songs.length,
            excluded,
        });

        return json({
            songs,
            meta: {
                isAdmin,
                rawCount: (data || []).length,
                eligibleCount: songs.length,
                excluded,
            },
        });
    } catch (error) {
        console.error("[api/ringtones/source-songs] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
