import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const playlistId = typeof body.playlistId === "string" ? body.playlistId.trim() : "";
    const songId = typeof body.songId === "string" ? body.songId.trim() : "";

    if (!userId || !isUuid(userId)) {
      return jsonResponse({ error: "Log in before adding songs to playlists." }, 401);
    }

    if (!playlistId || !songId) {
      return jsonResponse({ error: "Choose a playlist and song first." }, 400);
    }

    const supabase = getSupabaseServerClient();
    const existing = await supabase
      .from("playlist_songs")
      .select("playlist_id,song_id")
      .eq("user_id", userId)
      .eq("playlist_id", playlistId)
      .eq("song_id", songId)
      .maybeSingle();

    if (existing.error) {
      console.error("[api/playlist-songs] duplicate check failed:", existing.error);
      return jsonResponse({ error: getErrorMessage(existing.error) }, 500);
    }

    if (existing.data) {
      return jsonResponse({ ok: true, alreadyAdded: true });
    }

    const insert = await supabase.from("playlist_songs").insert({
      user_id: userId,
      playlist_id: playlistId,
      song_id: songId,
      created_at: new Date().toISOString(),
    });

    if (insert.error) {
      console.error("[api/playlist-songs] insert failed:", insert.error);
      return jsonResponse({ error: getErrorMessage(insert.error) }, 500);
    }

    return jsonResponse({ ok: true, alreadyAdded: false });
  } catch (error) {
    console.error("[api/playlist-songs] server error:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
