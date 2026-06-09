import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.error || JSON.stringify(record));
  }
  return "Unknown server error";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function safeSelect(query: PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const { data, error } = await query;
  if (error) {
    const message = getErrorMessage(error).toLowerCase();
    if (message.includes("does not exist") || message.includes("schema cache")) return [];
    throw error;
  }
  return data || [];
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId")?.trim() || "";
    if (userId && !isUuid(userId)) {
      return Response.json({ error: "Invalid user id." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const [songs, videos, albums, playlists, librarySaves, songLikes, videoLikes, follows] = await Promise.all([
      safeSelect((userId ? supabase.from("songs").select("*").eq("user_id", userId) : supabase.from("songs").select("*")).order("created_at", { ascending: false })),
      safeSelect((userId ? supabase.from("videos").select("*").eq("user_id", userId) : supabase.from("videos").select("*")).order("created_at", { ascending: false })),
      safeSelect((userId ? supabase.from("albums").select("*").eq("user_id", userId) : supabase.from("albums").select("*")).order("created_at", { ascending: false })),
      safeSelect((userId ? supabase.from("playlists").select("*").eq("user_id", userId) : supabase.from("playlists").select("*")).order("created_at", { ascending: false })),
      safeSelect(userId ? supabase.from("library_saves").select("*").eq("user_id", userId) : supabase.from("library_saves").select("*")),
      safeSelect(userId ? supabase.from("song_likes").select("*").eq("user_id", userId) : supabase.from("song_likes").select("*")),
      safeSelect(userId ? supabase.from("video_likes").select("*").eq("user_id", userId) : supabase.from("video_likes").select("*")),
      safeSelect(userId ? supabase.from("artist_follows").select("*").eq("user_id", userId) : supabase.from("artist_follows").select("*")),
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
      scope: userId ? { userId } : { userId: null, note: "Full export" },
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
      requested_by: userId || null,
      export_scope: userId ? "user" : "platform",
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
