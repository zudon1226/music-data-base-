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

async function probeStorageContentType(url: string) {
  try {
    let response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { Range: "bytes=0-0" },
      });
    }
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      error: getErrorMessage(error),
    };
  }
}

async function repairStorageMp4Metadata(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  storagePath: string,
  publicUrl: string,
) {
  const response = await fetch(publicUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not download ${storagePath} for MIME repair: HTTP ${response.status}`);
  }
  const body = await response.arrayBuffer();
  const { error } = await supabase.storage
    .from("videos")
    .upload(storagePath, body, {
      cacheControl: "3600",
      contentType: "video/mp4",
      upsert: true,
    });
  if (error) throw error;
}

async function repairVideoUrls(dryRun: boolean, repairMime: boolean) {
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

  const mimeRepairs: Array<{
    id: string;
    title: string;
    storagePath: string;
    publicUrl: string;
    status: number;
    contentType: string;
    repaired: boolean;
    error?: string;
  }> = [];

  if (repairMime) {
    const rowsWithStoragePaths = (data || [])
      .filter((row) => typeof row.storage_path === "string" && row.storage_path.trim())
      .map((row) => ({
        id: String(row.id),
        title: String(row.title || ""),
        storagePath: String(row.storage_path || ""),
        publicUrl: getSupabaseVideoPublicUrl(String(row.storage_path || "")),
      }))
      .filter((row) => row.publicUrl);

    for (const row of rowsWithStoragePaths) {
      const probe = await probeStorageContentType(row.publicUrl);
      const needsMimeRepair = !probe.contentType.toLowerCase().startsWith("video/mp4");
      if (!needsMimeRepair) {
        mimeRepairs.push({
          ...row,
          status: probe.status,
          contentType: probe.contentType,
          repaired: false,
        });
        continue;
      }
      try {
        if (!dryRun) {
          await repairStorageMp4Metadata(supabase, row.storagePath, row.publicUrl);
        }
        mimeRepairs.push({
          ...row,
          status: probe.status,
          contentType: probe.contentType,
          repaired: !dryRun,
        });
      } catch (error) {
        mimeRepairs.push({
          ...row,
          status: probe.status,
          contentType: probe.contentType,
          repaired: false,
          error: getErrorMessage(error),
        });
      }
    }
  }

  return {
    dryRun,
    repairMime,
    checked: data?.length || 0,
    repaired: dryRun ? 0 : candidates.length,
    candidates,
    mimeRepairs,
  };
}

function shouldRepairMime(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("repairMime") === "1" || url.searchParams.get("repairMime") === "true";
}

export async function GET(request: Request) {
  try {
    return jsonResponse(await repairVideoUrls(true, shouldRepairMime(request)));
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    return jsonResponse(await repairVideoUrls(false, shouldRepairMime(request)));
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
