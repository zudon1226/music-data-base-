import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function dayKey(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

function sumPlays(rows: Array<Record<string, unknown>>, key = "plays") {
    return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/creator-insights", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const supabase = getSupabaseServerClient();
        const [
            songsResult,
            videosResult,
            beatsResult,
            albumsResult,
            followersResult,
            followingResult,
            recentFollowers,
            ringtoneSales,
            activityResult,
        ] = await Promise.all([
            supabase.from("songs").select("id,title,plays,likes,created_at,cover_url").eq("user_id", userId).order("plays", { ascending: false }).limit(100),
            supabase.from("videos").select("id,title,views,likes,created_at,cover_url").eq("user_id", userId).order("views", { ascending: false }).limit(100),
            supabase.from("producer_beats").select("id,title,plays,likes,created_at,cover_url,producer_user_id").eq("producer_user_id", userId).order("plays", { ascending: false }).limit(100),
            supabase.from("albums").select("id,title,created_at,cover_url").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
            supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("following_user_id", userId),
            supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("follower_user_id", userId),
            supabase.from("user_follows").select("created_at").eq("following_user_id", userId).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
            supabase.from("ringtone_purchases").select("creator_earnings_cents,amount_cents,payment_status,purchased_at,creator_id").eq("creator_id", userId).eq("payment_status", "paid").limit(500),
            supabase.from("user_activity_events").select("kind,created_at").eq("actor_user_id", userId).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(500),
        ]);

        const songs = (songsResult.data || []) as Array<Record<string, unknown>>;
        const videos = (videosResult.data || []) as Array<Record<string, unknown>>;
        const beats = (beatsResult.data || []) as Array<Record<string, unknown>>;
        const albums = (albumsResult.data || []) as Array<Record<string, unknown>>;
        const totalPlays = sumPlays(songs, "plays") + sumPlays(videos, "views") + sumPlays(beats, "plays");
        const followerCount = Number(followersResult.count || 0);
        const followingCount = Number(followingResult.count || 0);

        const now = Date.now();
        const dayMs = 86400000;
        const followersGained7d = (recentFollowers.data || []).filter((row) => {
            const ts = Date.parse(String(row.created_at || ""));
            return Number.isFinite(ts) && now - ts <= 7 * dayMs;
        }).length;
        const followersGained30d = (recentFollowers.data || []).length;

        const sales = (ringtoneSales.data || []) as Array<Record<string, unknown>>;
        const revenueCents = sales.reduce((total, row) => total + (Number(row.creator_earnings_cents) || 0), 0);

        const dailyMap = new Map<string, { views: number; plays: number }>();
        for (let i = 0; i < 14; i += 1) {
            const key = new Date(now - i * dayMs).toISOString().slice(0, 10);
            dailyMap.set(key, { views: 0, plays: 0 });
        }
        for (const song of songs) {
            const key = dayKey(String(song.created_at || ""));
            if (!key || !dailyMap.has(key)) continue;
            const bucket = dailyMap.get(key)!;
            bucket.plays += Number(song.plays) || 0;
        }
        for (const video of videos) {
            const key = dayKey(String(video.created_at || ""));
            if (!key || !dailyMap.has(key)) continue;
            const bucket = dailyMap.get(key)!;
            bucket.views += Number(video.views) || 0;
        }

        const weeklyPlays = songs.concat(beats).reduce((total, row) => {
            const ts = Date.parse(String(row.created_at || ""));
            if (!Number.isFinite(ts) || now - ts > 7 * dayMs) return total;
            return total + (Number(row.plays) || 0);
        }, 0) + videos.reduce((total, row) => {
            const ts = Date.parse(String(row.created_at || ""));
            if (!Number.isFinite(ts) || now - ts > 7 * dayMs) return total;
            return total + (Number(row.views) || 0);
        }, 0);

        const monthlyPlays = songs.concat(beats).reduce((total, row) => {
            const ts = Date.parse(String(row.created_at || ""));
            if (!Number.isFinite(ts) || now - ts > 30 * dayMs) return total;
            return total + (Number(row.plays) || 0);
        }, 0) + videos.reduce((total, row) => {
            const ts = Date.parse(String(row.created_at || ""));
            if (!Number.isFinite(ts) || now - ts > 30 * dayMs) return total;
            return total + (Number(row.views) || 0);
        }, 0);

        const trending = [
            ...songs.slice(0, 3).map((row) => ({
                id: String(row.id),
                title: String(row.title || "Song"),
                mediaType: "song" as const,
                metric: Number(row.plays) || 0,
                coverUrl: String(row.cover_url || ""),
            })),
            ...videos.slice(0, 2).map((row) => ({
                id: String(row.id),
                title: String(row.title || "Video"),
                mediaType: "video" as const,
                metric: Number(row.views) || 0,
                coverUrl: String(row.cover_url || ""),
            })),
        ].sort((a, b) => b.metric - a.metric).slice(0, 5);

        const activityCount = (activityResult.data || []).length;

        return jsonResponse({
            widgets: {
                totalPlays,
                followersGained7d,
                followersGained30d,
                followerCount,
                followingCount,
                revenueCents,
                uploadStats: {
                    songs: songs.length,
                    videos: videos.length,
                    beats: beats.length,
                    albums: albums.length,
                },
                trendingReleases: trending,
                activityCount30d: activityCount,
            },
            insights: {
                topSongs: songs.slice(0, 5).map((row) => ({
                    id: String(row.id),
                    title: String(row.title || "Untitled"),
                    plays: Number(row.plays) || 0,
                    likes: Number(row.likes) || 0,
                    coverUrl: String(row.cover_url || ""),
                })),
                topVideos: videos.slice(0, 5).map((row) => ({
                    id: String(row.id),
                    title: String(row.title || "Untitled"),
                    views: Number(row.views) || 0,
                    likes: Number(row.likes) || 0,
                    coverUrl: String(row.cover_url || ""),
                })),
                topBeats: beats.slice(0, 5).map((row) => ({
                    id: String(row.id),
                    title: String(row.title || "Untitled"),
                    plays: Number(row.plays) || 0,
                    likes: Number(row.likes) || 0,
                    coverUrl: String(row.cover_url || ""),
                })),
                daily: [...dailyMap.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([date, value]) => ({ date, ...value })),
                weeklyPlays,
                monthlyPlays,
            },
        });
    }
    catch (error) {
        console.error("[api/creator-insights] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
