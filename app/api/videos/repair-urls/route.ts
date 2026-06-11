import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function getSupabaseVideoPublicUrl(storagePath: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const cleanPath = storagePath.trim().replace(/^\/+/, "");
  if (!supabaseUrl || !cleanPath) return "";
  return `${supabaseUrl}/storage/v1/object/public/videos/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
}

function isLikelyStoragePath(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed && !/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("blob:") && !trimmed.startsWith("data:") && !trimmed.startsWith("/"));
}

function isPublicSupabaseVideoUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" &&
      url.hostname.endsWith(".supabase.co") &&
      url.pathname.toLowerCase().includes("/storage/v1/object/public/videos/");
  } catch {
    return false;
  }
}

function shouldRepairVideoUrl(videoUrl: string) {
  const cleanUrl = videoUrl.trim();
  if (!cleanUrl) return true;
  if (isPublicSupabaseVideoUrl(cleanUrl)) return false;
  if (isLikelyStoragePath(cleanUrl)) return true;
  if (cleanUrl.includes("/api/video-upload") || cleanUrl.includes("/api/upload-video")) return true;
  try {
    const url = new URL(cleanUrl);
    const path = url.pathname.toLowerCase();
    return path.includes("/storage/v1/object/sign/") ||
      path.includes("/storage/v1/object/upload/") ||
      path.includes("/storage/v1/upload/");
  } catch {
    return true;
  }
}

async function repairVideoUrls(dryRun: boolean) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("id,title,video_url,storage_path")
    .not("storage_path", "is", null);

  if (error) throw error;

  const candidates = (data || [])
    .filter((row) => typeof row.storage_path === "string" && row.storage_path.trim())
    .map((row) => ({
      id: String(row.id),
      title: String(row.title || ""),
      before: String(row.video_url || ""),
      storagePath: String(row.storage_path || ""),
      after: getSupabaseVideoPublicUrl(String(row.storage_path || "")),
    }))
    .filter((row) => row.after && shouldRepairVideoUrl(row.before));

  if (!dryRun) {
    for (const row of candidates) {
      const { error: updateError } = await supabase
        .from("videos")
        .update({ video_url: row.after })
        .eq("id", row.id);
      if (updateError) throw updateError;
    }
  }

  return {
    dryRun,
    checked: data?.length || 0,
    repaired: dryRun ? 0 : candidates.length,
    candidates,
  };
}

export async function GET() {
  try {
    return jsonResponse(await repairVideoUrls(true));
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST() {
  try {
    return jsonResponse(await repairVideoUrls(false));
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
