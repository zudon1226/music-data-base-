import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { resolveSongPlayableUrl } from "@/lib/desktop-media-queue";
import { loadResolvedAccountCapabilities } from "@/lib/resolved-account-role";
import { requireRingtoneStudioAccess } from "@/lib/ringtone-access";
import { isSongUsageColumnError, songAllowsRingtoneCreation } from "@/lib/song-usage-permissions";
import { normalizeRingtoneSourceDurationSeconds } from "@/lib/ringtone-validation";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function mapEligibleSongRows(data: Array<Record<string, unknown>> | null) {
    const excluded = {
        noPlayableAudio: 0,
        knownTooShort: 0,
        notPermitted: 0,
    };
    const songs = [];
    for (const row of data || []) {
        const record = row as Record<string, unknown>;
        if (!songAllowsRingtoneCreation(record)) {
            excluded.notPermitted += 1;
            continue;
        }
        const resolved = resolveSongPlayableUrl(record);
        if (!resolved.playableUrl && !resolved.storagePath) {
            excluded.noPlayableAudio += 1;
            continue;
        }
        const durationSeconds = normalizeRingtoneSourceDurationSeconds(record.duration) || 0;
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
            durationSeconds,
            createdAt: record.created_at ? String(record.created_at) : null,
            ownerUserId: record.user_id ? String(record.user_id) : "",
            producerId: record.producer_id ? String(record.producer_id) : "",
            sourceScope: "library",
        });
    }
    return { songs, excluded };
}

/** Eligible source songs: creator-owned uploads or listener Library saves with creation permission. */
export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/ringtones/source-songs", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const studio = await requireRingtoneStudioAccess(userId);
        if (!studio.ok) return json({ error: studio.error }, studio.status);

        const isAdmin = await isAdminUserId(userId);
        const capabilities = await loadResolvedAccountCapabilities(userId);
        const useLibrarySources = capabilities.canPersonalRingtones && !capabilities.canMyRingtones;

        const supabase = getSupabaseServerClient();

        if (!useLibrarySources) {
            let query = supabase
                .from("songs")
                .select("id,title,artist,cover_url,audio_url,storage_path,duration,created_at,user_id,producer_id,streaming_enabled,ringtone_enabled,ringtone_creation_enabled")
                .eq("ringtone_enabled", true)
                .eq("ringtone_creation_enabled", true)
                .order("created_at", { ascending: false })
                .limit(isAdmin ? 500 : 200);

            if (!isAdmin) {
                query = query.or(`user_id.eq.${userId},producer_id.eq.${userId}`);
            }

            let { data, error } = await query;
            if (error && isSongUsageColumnError(getErrorMessage(error))) {
                let legacyQuery = supabase
                    .from("songs")
                    .select("id,title,artist,cover_url,audio_url,storage_path,duration,created_at,user_id,producer_id")
                    .order("created_at", { ascending: false })
                    .limit(isAdmin ? 500 : 200);
                if (!isAdmin) {
                    legacyQuery = legacyQuery.or(`user_id.eq.${userId},producer_id.eq.${userId}`);
                }
                const legacy = await legacyQuery;
                data = legacy.data as typeof data;
                error = legacy.error;
            }
            if (error) {
                console.error("[api/ringtones/source-songs] query failed", {
                    userId,
                    isAdmin,
                    code: (error as { code?: string }).code || "",
                    message: getErrorMessage(error),
                });
                return json({ error: getErrorMessage(error) }, 500);
            }

            const mapped = await mapEligibleSongRows((data || []) as Array<Record<string, unknown>>);
            for (const song of mapped.songs) {
                (song as Record<string, unknown>).sourceScope = "owned";
            }

            console.info("[api/ringtones/source-songs]", {
                userId,
                mode: "owned",
                eligibleResultCount: mapped.songs.length,
                excluded: mapped.excluded,
            });

            return json({
                songs: mapped.songs,
                meta: {
                    mode: "owned",
                    isAdmin,
                    eligibleCount: mapped.songs.length,
                    excluded: mapped.excluded,
                },
            });
        }

        const savesResult = await supabase
            .from("library_saves")
            .select("item_id")
            .eq("user_id", userId)
            .eq("item_type", "song");
        if (savesResult.error) {
            return json({ error: getErrorMessage(savesResult.error) }, 500);
        }
        const songIds = [...new Set((savesResult.data || [])
            .map((row) => String(row.item_id || ""))
            .filter((id) => isUuid(id)))];
        if (songIds.length === 0) {
            return json({
                songs: [],
                meta: { mode: "library", eligibleCount: 0, excluded: { noPlayableAudio: 0, knownTooShort: 0, notPermitted: 0 } },
            });
        }

        const { data, error } = await supabase
            .from("songs")
            .select("id,title,artist,cover_url,audio_url,storage_path,duration,created_at,user_id,producer_id,streaming_enabled,ringtone_enabled,ringtone_creation_enabled")
            .in("id", songIds)
            .eq("ringtone_enabled", true)
            .eq("ringtone_creation_enabled", true)
            .order("created_at", { ascending: false });
        if (error) {
            return json({ error: getErrorMessage(error) }, 500);
        }

        const mapped = await mapEligibleSongRows((data || []) as Array<Record<string, unknown>>);

        console.info("[api/ringtones/source-songs]", {
            userId,
            mode: "library",
            librarySaveCount: songIds.length,
            eligibleResultCount: mapped.songs.length,
            excluded: mapped.excluded,
        });

        return json({
            songs: mapped.songs,
            meta: {
                mode: "library",
                librarySaveCount: songIds.length,
                eligibleCount: mapped.songs.length,
                excluded: mapped.excluded,
            },
        });
    } catch (error) {
        console.error("[api/ringtones/source-songs] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
