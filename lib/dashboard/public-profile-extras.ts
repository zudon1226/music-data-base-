import { getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type PublicProfileExtras = {
    username?: string;
    city?: string;
    country?: string;
    followingCount?: number;
    publicPlaylists?: Array<{
        id: string;
        name: string;
        coverUrl?: string;
        playlistType?: string;
        createdAt?: string;
    }>;
};

export async function loadPublicProfileExtras(userId: string): Promise<PublicProfileExtras & { followerCount: number }> {
    if (!userId || !isUuid(userId)) {
        return {
            followingCount: 0,
            publicPlaylists: [],
            username: "",
            city: "",
            country: "",
            followerCount: 0,
        };
    }
    const supabase = getSupabaseServerClient();
    const [followers, following, playlists, profile] = await Promise.all([
        supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("following_user_id", userId),
        supabase.from("user_follows").select("id", { count: "exact", head: true }).eq("follower_user_id", userId),
        supabase
            .from("playlists")
            .select("id,name,cover_url,playlist_type,created_at")
            .eq("user_id", userId)
            .eq("is_public", true)
            .order("created_at", { ascending: false })
            .limit(40),
        supabase
            .from("profiles")
            .select("username,city,country")
            .or(`id.eq.${userId},user_id.eq.${userId}`)
            .maybeSingle(),
    ]);
    const row = (profile.data || {}) as Record<string, unknown>;
    return {
        followerCount: Number(followers.count || 0),
        followingCount: Number(following.count || 0),
        username: String(row.username || ""),
        city: String(row.city || ""),
        country: String(row.country || ""),
        publicPlaylists: (playlists.data || []).map((item) => ({
            id: String((item as Record<string, unknown>).id || ""),
            name: String((item as Record<string, unknown>).name || "Playlist"),
            coverUrl: String((item as Record<string, unknown>).cover_url || ""),
            playlistType: String((item as Record<string, unknown>).playlist_type || "mixed"),
            createdAt: String((item as Record<string, unknown>).created_at || ""),
        })),
    };
}
