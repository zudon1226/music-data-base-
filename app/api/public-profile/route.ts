import { loadPublicArtistProfile, loadPublicProducerProfile } from "@/lib/public-profile";
import { optionalMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const identifier = url.searchParams.get("id")?.trim()
            || url.searchParams.get("slug")?.trim()
            || url.searchParams.get("username")?.trim()
            || "";
        const type = (url.searchParams.get("type")?.trim() || "artist").toLowerCase();
        const viewerId = url.searchParams.get("viewerId")?.trim() || "";
        if (!identifier) {
            return jsonResponse({ error: "Profile id is required." }, 400);
        }

        const supabase = getSupabaseServerClient();
        let profile = type === "producer"
            ? await loadPublicProducerProfile(identifier)
            : await loadPublicArtistProfile(identifier);

        // Fallback: resolve by profiles.username / public_slug / user id
        if (!profile && isUuid(identifier)) {
            const { data: userProfile } = await supabase
                .from("profiles")
                .select("id,user_id,display_name,username,public_slug,avatar_url,banner_url,bio,website,account_type,created_at")
                .or(`id.eq.${identifier},user_id.eq.${identifier}`)
                .maybeSingle();
            if (userProfile) {
                const accountType = String((userProfile as Record<string, unknown>).account_type || "listener").toLowerCase();
                profile = accountType === "producer"
                    ? await loadPublicProducerProfile(String((userProfile as Record<string, unknown>).user_id || identifier))
                    : await loadPublicArtistProfile(String((userProfile as Record<string, unknown>).user_id || identifier));
                if (!profile) {
                    const row = userProfile as Record<string, unknown>;
                    profile = {
                        id: String(row.id || identifier),
                        userId: String(row.user_id || row.id || identifier),
                        name: String(row.display_name || row.username || "Creator"),
                        type: accountType === "producer" ? "producer" : "artist",
                        avatarUrl: String(row.avatar_url || ""),
                        bannerUrl: String(row.banner_url || ""),
                        bio: String(row.bio || ""),
                        website: String(row.website || ""),
                        verified: false,
                        followers: 0,
                        monthlyListeners: 0,
                        songs: [],
                        videos: [],
                        albums: [],
                        beats: [],
                    };
                }
            }
        }

        if (!profile) {
            const { data: byUsername } = await supabase
                .from("profiles")
                .select("id,user_id,display_name,username,public_slug,avatar_url,banner_url,bio,website,account_type")
                .or(`username.ilike.${identifier},public_slug.ilike.${identifier}`)
                .limit(1)
                .maybeSingle();
            if (byUsername) {
                const row = byUsername as Record<string, unknown>;
                const uid = String(row.user_id || row.id || "");
                const accountType = String(row.account_type || "listener").toLowerCase();
                profile = accountType === "producer"
                    ? await loadPublicProducerProfile(uid)
                    : await loadPublicArtistProfile(uid);
                if (!profile) {
                    profile = {
                        id: String(row.id || uid),
                        userId: uid,
                        name: String(row.display_name || row.username || identifier),
                        type: accountType === "producer" ? "producer" : "artist",
                        avatarUrl: String(row.avatar_url || ""),
                        bannerUrl: String(row.banner_url || ""),
                        bio: String(row.bio || ""),
                        website: String(row.website || ""),
                        verified: false,
                        followers: 0,
                        monthlyListeners: 0,
                        songs: [],
                        videos: [],
                        albums: [],
                        beats: [],
                    };
                }
            }
        }

        if (!profile) {
            return jsonResponse({ error: "Profile not found." }, 404);
        }

        const targetUserId = String(profile.userId || "").trim();
        let publicPlaylists: Array<Record<string, unknown>> = [];
        let followerCount = Number(profile.followers) || 0;
        let followingCount = 0;
        let username = "";
        let city = "";
        let country = "";

        if (targetUserId && isUuid(targetUserId)) {
            const [playlistsResult, followersResult, followingResult, profileRow] = await Promise.all([
                supabase.from("playlists").select("id,name,cover_url,playlist_type,created_at,is_public").eq("user_id", targetUserId).eq("is_public", true).order("created_at", { ascending: false }).limit(40),
                supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("following_user_id", targetUserId),
                supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("follower_user_id", targetUserId),
                supabase.from("profiles").select("username,city,country,display_name,avatar_url,bio,website").or(`id.eq.${targetUserId},user_id.eq.${targetUserId}`).maybeSingle(),
            ]);
            publicPlaylists = (playlistsResult.data || []).map((row) => ({
                id: String((row as Record<string, unknown>).id || ""),
                name: String((row as Record<string, unknown>).name || "Playlist"),
                coverUrl: String((row as Record<string, unknown>).cover_url || ""),
                playlistType: String((row as Record<string, unknown>).playlist_type || "mixed"),
                createdAt: String((row as Record<string, unknown>).created_at || ""),
            }));
            followerCount = Math.max(followerCount, Number(followersResult.count || 0));
            followingCount = Number(followingResult.count || 0);
            const row = (profileRow.data || {}) as Record<string, unknown>;
            username = String(row.username || "").trim();
            city = String(row.city || "").trim();
            country = String(row.country || "").trim();
            if (row.display_name) profile.name = String(row.display_name);
            if (row.avatar_url) profile.avatarUrl = String(row.avatar_url);
            if (row.bio) profile.bio = String(row.bio);
            if (row.website) profile.website = String(row.website);
        }

        let isFollowing = false;
        let isMutual = false;
        if (viewerId && isUuid(viewerId) && targetUserId && isUuid(targetUserId) && viewerId !== targetUserId) {
            const auth = await optionalMatchingUserId(request, viewerId, { route: "/api/public-profile" });
            if (auth.ok) {
                const [{ data: outgoing }, { data: incoming }] = await Promise.all([
                    supabase.from("user_follows").select("id").eq("follower_user_id", viewerId).eq("following_user_id", targetUserId).maybeSingle(),
                    supabase.from("user_follows").select("id").eq("follower_user_id", targetUserId).eq("following_user_id", viewerId).maybeSingle(),
                ]);
                isFollowing = Boolean(outgoing?.id);
                isMutual = isFollowing && Boolean(incoming?.id);
            }
        }

        const totalUploads = profile.songs.length + profile.videos.length + profile.albums.length + profile.beats.length;
        const totalPlays = profile.songs.reduce((n, item) => n + (Number.parseInt(item.metricLabel, 10) || 0), 0)
            + profile.videos.reduce((n, item) => n + (Number.parseInt(item.metricLabel, 10) || 0), 0)
            + profile.beats.reduce((n, item) => n + (Number.parseInt(item.metricLabel, 10) || 0), 0);

        return jsonResponse({
            profile: {
                ...profile,
                username,
                city,
                country,
                followerCount,
                followingCount,
                totalUploads,
                totalPlays,
                publicPlaylists,
            },
            follow: {
                isFollowing,
                isMutual,
                canFollow: Boolean(targetUserId && isUuid(targetUserId) && viewerId && viewerId !== targetUserId),
            },
        });
    }
    catch (error) {
        console.error("[api/public-profile] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
