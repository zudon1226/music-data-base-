import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SONGS_BUCKET = "songs";

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  }

  if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getContentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();

  if (extension === "wav") return "audio/wav";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "aac") return "audio/aac";
  return "audio/mpeg";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path) {
      return Response.json({ error: "Missing audio path." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.storage.from(SONGS_BUCKET).download(path);

    if (error || !data) {
      console.error("[api/audio] Supabase download failed:", error);
      return Response.json({ error: error?.message || "Audio file could not be loaded." }, { status: 500 });
    }

    return new Response(data.stream(), {
      headers: {
        "Content-Type": data.type || getContentType(path),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[api/audio] Server error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Audio file could not be loaded." }, { status: 500 });
  }
}
