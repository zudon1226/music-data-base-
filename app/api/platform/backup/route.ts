import { requireAuthenticatedPlatformOwner } from "@/lib/admin-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeSelect(query: PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const { data, error } = await query;
  if (error) {
    const message = getErrorMessage(error).toLowerCase();
    if (message.includes("does not exist") || message.includes("schema cache")) return [];
    throw error;
  }
  return data || [];
}

/**
 * Privileged PCC backup/export.
 * Authorization is resolved from the authenticated session only (owner required).
 * Optional `userId` query scopes the export payload; it is never used for auth.
 */
export async function GET(request: Request) {
  try {
    const owner = await requireAuthenticatedPlatformOwner(request, "/api/platform/backup");
    if (!owner.ok) {
      return Response.json({ error: owner.error }, { status: owner.status });
    }

    const url = new URL(request.url);
    const scopeUserId = url.searchParams.get("userId")?.trim() || "";
    if (scopeUserId && !isUuid(scopeUserId)) {
      return Response.json({ error: "Invalid export scope user id." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const [songs, videos, albums, playlists, librarySaves, songLikes, videoLikes, follows] = await Promise.all([
      safeSelect((scopeUserId ? supabase.from("songs").select("*").eq("user_id", scopeUserId) : supabase.from("songs").select("*")).order("created_at", { ascending: false })),
      safeSelect((scopeUserId ? supabase.from("videos").select("*").eq("user_id", scopeUserId) : supabase.from("videos").select("*")).order("created_at", { ascending: false })),
      safeSelect((scopeUserId ? supabase.from("albums").select("*").eq("user_id", scopeUserId) : supabase.from("albums").select("*")).order("created_at", { ascending: false })),
      safeSelect((scopeUserId ? supabase.from("playlists").select("*").eq("user_id", scopeUserId) : supabase.from("playlists").select("*")).order("created_at", { ascending: false })),
      safeSelect(scopeUserId ? supabase.from("library_saves").select("*").eq("user_id", scopeUserId) : supabase.from("library_saves").select("*")),
      safeSelect(scopeUserId ? supabase.from("song_likes").select("*").eq("user_id", scopeUserId) : supabase.from("song_likes").select("*")),
      safeSelect(scopeUserId ? supabase.from("video_likes").select("*").eq("user_id", scopeUserId) : supabase.from("video_likes").select("*")),
      safeSelect(scopeUserId ? supabase.from("artist_follows").select("*").eq("user_id", scopeUserId) : supabase.from("artist_follows").select("*")),
    ]);

    const playlistIds = playlists.map((playlist) => String((playlist as Record<string, unknown>).id || "")).filter(Boolean);
    const playlistItems = playlistIds.length > 0
      ? await safeSelect(supabase.from("playlist_items").select("*").in("playlist_id", playlistIds))
      : [];
    const playlistSongs = playlistIds.length > 0
      ? await safeSelect(supabase.from("playlist_songs").select("*").in("playlist_id", playlistIds))
      : [];

    const exportData = {
      exportedAt: new Date().toISOString(),
      scope: scopeUserId ? { userId: scopeUserId } : { userId: null, note: "Full export" },
      songs,
      videos,
      albums,
      playlists,
      playlist_items: playlistItems,
      playlist_songs: playlistSongs,
      library_saves: librarySaves,
      likes: {
        songs: songLikes,
        videos: videoLikes,
      },
      follows,
    };

    const filename = `music-data-base-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const recordCounts = {
      songs: songs.length,
      videos: videos.length,
      albums: albums.length,
      playlists: playlists.length,
      playlist_items: playlistItems.length,
      playlist_songs: playlistSongs.length,
      library_saves: librarySaves.length,
      song_likes: songLikes.length,
      video_likes: videoLikes.length,
      follows: follows.length,
    };

    const backupLogResult = await supabase.from("backup_exports").insert({
      requested_by: owner.userId,
      export_scope: scopeUserId ? "user" : "platform",
      status: "completed",
      file_name: filename,
      record_counts: recordCounts,
    });
    if (backupLogResult.error) {
      const message = getErrorMessage(backupLogResult.error).toLowerCase();
      if (!message.includes("does not exist") && !message.includes("schema cache")) {
        console.warn("[api/platform/backup] backup log skipped:", backupLogResult.error);
      }
    }

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/platform/backup] export failed:", error);
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
