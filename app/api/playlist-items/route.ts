import { NextResponse } from "next/server";
import { getErrorMessage, getSupabaseLibraryClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function normalizeItemType(value: unknown) {
  return value === "video" ? "video" : "song";
}

function normalizePlaylistType(value: unknown) {
  return value === "song" || value === "video" || value === "mixed" ? value : "mixed";
}

function getPlaylistTypeFromName(value: unknown) {
  const name = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (name === "videos" || name === "video" || name.includes("video playlist")) return "video";
  if (name === "songs" || name === "song" || name.includes("song playlist")) return "song";
  return "mixed";
}

function isMissingColumn(error: unknown, columnName: string) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes(columnName.toLowerCase()) || message.includes("schema cache") || message.includes("column");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const playlistId = typeof body.playlistId === "string" ? body.playlistId.trim() : "";
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    const itemType = normalizeItemType(body.itemType);

    if (!userId || !isUuid(userId)) {
      return jsonResponse({ error: "Log in before adding items to playlists." }, 401);
    }

    if (!playlistId || !isUuid(playlistId) || !itemId) {
      return jsonResponse({ error: "Choose a playlist and item first." }, 400);
    }

    if (!isUuid(itemId) || itemId.startsWith("storage-")) {
      return jsonResponse({ error: "Playlist items must use real Supabase media ids." }, 400);
    }

    const supabase = getSupabaseLibraryClient();
    const mediaTable = itemType === "video" ? "videos" : "songs";
    const mediaResult = await supabase.from(mediaTable).select("id").eq("id", itemId).maybeSingle();
    if (mediaResult.error) {
      console.error("[api/playlist-items] media lookup failed:", mediaResult.error);
      return jsonResponse({ error: getErrorMessage(mediaResult.error) }, 500);
    }
    if (!mediaResult.data) {
      return jsonResponse({ error: `${itemType === "video" ? "Video" : "Song"} not found.` }, 404);
    }
    let owner = await supabase
      .from("playlists")
      .select("id,name,playlist_type")
      .eq("id", playlistId)
      .eq("user_id", userId)
      .maybeSingle();

    if (owner.error && isMissingColumn(owner.error, "playlist_type")) {
      owner = await supabase
        .from("playlists")
        .select("id,name")
        .eq("id", playlistId)
        .eq("user_id", userId)
        .maybeSingle();
    }

    if (owner.error) {
      console.error("[api/playlist-items] playlist owner check failed:", owner.error);
      return jsonResponse({ error: getErrorMessage(owner.error) }, 500);
    }

    if (!owner.data) {
      return jsonResponse({ error: "Playlist not found for this user." }, 404);
    }

    const existing = await supabase
      .from("playlist_items")
      .select("id")
      .eq("playlist_id", playlistId)
      .eq("item_id", itemId)
      .eq("item_type", itemType)
      .maybeSingle();

    if (existing.error) {
      console.error("[api/playlist-items] duplicate check failed:", existing.error);
      return jsonResponse({ error: getErrorMessage(existing.error) }, 500);
    }

    if (existing.data) {
      return jsonResponse({ ok: true, alreadyAdded: true });
    }

    const insert = await supabase.from("playlist_items").insert({
      id: crypto.randomUUID(),
      playlist_id: playlistId,
      item_id: itemId,
      item_type: itemType,
      created_at: new Date().toISOString(),
    });

    if (insert.error) {
      console.error("[api/playlist-items] insert failed:", insert.error);
      return jsonResponse({ error: getErrorMessage(insert.error) }, 500);
    }

    return jsonResponse({ ok: true, alreadyAdded: false });
  } catch (error) {
    console.error("[api/playlist-items] server error:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const playlistId = typeof body.playlistId === "string" ? body.playlistId.trim() : "";
    const itemType = normalizeItemType(body.itemType);

    if (!userId || !isUuid(userId)) {
      return jsonResponse({ error: "Log in before removing playlist items." }, 401);
    }

    if (!playlistId || !isUuid(playlistId)) {
      return jsonResponse({ error: "Choose a playlist first." }, 400);
    }

    const supabase = getSupabaseLibraryClient();
    const owner = await supabase
      .from("playlists")
      .select("id")
      .eq("id", playlistId)
      .eq("user_id", userId)
      .maybeSingle();

    if (owner.error) {
      console.error("[api/playlist-items] delete owner check failed:", owner.error);
      return jsonResponse({ error: getErrorMessage(owner.error) }, 500);
    }

    if (!owner.data) {
      return jsonResponse({ error: "Playlist not found for this user." }, 404);
    }

    let query = supabase.from("playlist_items").delete().eq("playlist_id", playlistId).eq("item_type", itemType);
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    if (itemId) query = query.eq("item_id", itemId);

    const result = await query;
    if (result.error) {
      console.error("[api/playlist-items] delete failed:", result.error);
      return jsonResponse({ error: getErrorMessage(result.error) }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("[api/playlist-items] delete server error:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
