import { NextResponse } from "next/server";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseLibraryClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function normalizeItemType(value: unknown) {
  return value === "video" ? "video" : "song";
}

function isMissingColumn(error: unknown, columnName: string) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes(columnName.toLowerCase()) || message.includes("schema cache") || message.includes("column");
}

type QueuePlaylistItem = {
  itemId: string;
  itemType: "song" | "video";
};

function parseQueueItems(raw: unknown): QueuePlaylistItem[] | null {
  if (!Array.isArray(raw)) return null;
  const items: QueuePlaylistItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const itemId = typeof record.itemId === "string" ? record.itemId.trim() : "";
    const itemType = normalizeItemType(record.itemType);
    if (!itemId || !isUuid(itemId) || itemId.startsWith("storage-")) continue;
    const key = `${itemType}:${itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ itemId, itemType });
  }
  return items;
}

async function assertPlaylistOwner(
  supabase: ReturnType<typeof getSupabaseLibraryClient>,
  playlistId: string,
  userId: string,
) {
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
    return { ok: false as const, status: 500, error: getErrorMessage(owner.error), playlist: null };
  }
  if (!owner.data) {
    return { ok: false as const, status: 404, error: "Playlist not found for this user.", playlist: null };
  }
  return { ok: true as const, status: 200, error: "", playlist: owner.data };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const playlistId = typeof body.playlistId === "string" ? body.playlistId.trim() : "";
    const batchItems = parseQueueItems(body.items);

    if (!userId || !isUuid(userId)) {
      return jsonResponse({ error: "Log in before adding items to playlists." }, 401);
    }
    const auth = await requireMatchingUserId(request, "/api/playlist-items", userId, getSessionTokensFromRecord(body));
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    if (!playlistId || !isUuid(playlistId)) {
      return jsonResponse({ error: "Choose a playlist and item first." }, 400);
    }

    const supabase = getSupabaseLibraryClient();
    const owner = await assertPlaylistOwner(supabase, playlistId, userId);
    if (!owner.ok) {
      return jsonResponse({ error: owner.error }, owner.status);
    }

    // Batch append (queue → existing playlist): one authenticated request.
    if (batchItems) {
      if (batchItems.length === 0) {
        return jsonResponse({ error: "Choose at least one queue item to add." }, 400);
      }
      if (batchItems.length > 500) {
        return jsonResponse({ error: "Too many queue items in one request." }, 400);
      }

      const songIds = [...new Set(batchItems.filter((item) => item.itemType === "song").map((item) => item.itemId))];
      const videoIds = [...new Set(batchItems.filter((item) => item.itemType === "video").map((item) => item.itemId))];
      const [songsResult, videosResult, existingResult] = await Promise.all([
        songIds.length > 0
          ? supabase.from("songs").select("id").in("id", songIds)
          : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
        videoIds.length > 0
          ? supabase.from("videos").select("id").in("id", videoIds)
          : Promise.resolve({ data: [] as Array<{ id: string }>, error: null }),
        supabase
          .from("playlist_items")
          .select("item_id,item_type")
          .eq("playlist_id", playlistId),
      ]);

      if (songsResult.error) {
        return jsonResponse({ error: getErrorMessage(songsResult.error) }, 500);
      }
      if (videosResult.error) {
        return jsonResponse({ error: getErrorMessage(videosResult.error) }, 500);
      }
      if (existingResult.error) {
        return jsonResponse({ error: getErrorMessage(existingResult.error) }, 500);
      }

      const validSongs = new Set((songsResult.data || []).map((row) => String(row.id || "")));
      const validVideos = new Set((videosResult.data || []).map((row) => String(row.id || "")));
      const existingKeys = new Set(
        (existingResult.data || []).map((row) => `${row.item_type === "video" ? "video" : "song"}:${row.item_id}`),
      );

      const toInsert: Array<{
        id: string;
        playlist_id: string;
        item_id: string;
        item_type: "song" | "video";
        created_at: string;
      }> = [];
      let skippedMissing = 0;
      let skippedExisting = 0;
      const baseMs = Date.now();

      for (const item of batchItems) {
        const key = `${item.itemType}:${item.itemId}`;
        const existsInMedia = item.itemType === "video"
          ? validVideos.has(item.itemId)
          : validSongs.has(item.itemId);
        if (!existsInMedia) {
          skippedMissing += 1;
          continue;
        }
        if (existingKeys.has(key)) {
          skippedExisting += 1;
          continue;
        }
        existingKeys.add(key);
        toInsert.push({
          id: crypto.randomUUID(),
          playlist_id: playlistId,
          item_id: item.itemId,
          item_type: item.itemType,
          // Preserve queue order after existing playlist rows (created_at ascending).
          created_at: new Date(baseMs + toInsert.length).toISOString(),
        });
      }

      if (toInsert.length > 0) {
        const insert = await supabase.from("playlist_items").insert(toInsert);
        if (insert.error) {
          console.error("[api/playlist-items] batch insert failed:", insert.error);
          return jsonResponse({ error: getErrorMessage(insert.error) }, 500);
        }
      }

      return jsonResponse({
        ok: true,
        added: toInsert.length,
        skippedExisting,
        skippedMissing,
        alreadyAdded: toInsert.length === 0 && skippedExisting > 0 && skippedMissing === 0,
      });
    }

    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
    const itemType = normalizeItemType(body.itemType);

    if (!itemId) {
      return jsonResponse({ error: "Choose a playlist and item first." }, 400);
    }

    if (!isUuid(itemId) || itemId.startsWith("storage-")) {
      return jsonResponse({ error: "Playlist items must use real Supabase media ids." }, 400);
    }

    const mediaTable = itemType === "video" ? "videos" : "songs";
    const mediaResult = await supabase.from(mediaTable).select("id").eq("id", itemId).maybeSingle();
    if (mediaResult.error) {
      console.error("[api/playlist-items] media lookup failed:", mediaResult.error);
      return jsonResponse({ error: getErrorMessage(mediaResult.error) }, 500);
    }
    if (!mediaResult.data) {
      return jsonResponse({ error: `${itemType === "video" ? "Video" : "Song"} not found.` }, 404);
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
    const auth = await requireMatchingUserId(request, "/api/playlist-items", userId, getSessionTokensFromRecord(body));
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
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
