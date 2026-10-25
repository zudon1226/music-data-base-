import { requireAuthenticatedPlatformOwner } from "@/lib/admin-auth";
import { isCatalogItemPubliclyPlayable, isModerationHoldColumnError } from "@/lib/moderation-status.mjs";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function getGuardedVideoRepairUrl(storagePath: string, videoId?: string) {
  const cleanPath = storagePath.trim().replace(/^\/+/, "");
  if (!cleanPath) return "";
  const params = new URLSearchParams();
  params.set("path", cleanPath);
  if (videoId?.trim()) params.set("videoId", videoId.trim());
  return `/api/video-playback?${params.toString()}`;
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

async function probeStorageObjectContentType(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  storagePath: string,
) {
  try {
    const { data, error } = await supabase.storage.from("videos").download(storagePath);
    if (error || !data) {
      return {
        ok: false,
        status: 404,
        contentType: "",
        error: getErrorMessage(error) || "Object not found.",
      };
    }
    return {
      ok: true,
      status: 200,
      contentType: data.type || "video/mp4",
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
) {
  const { data, error } = await supabase.storage.from("videos").download(storagePath);
  if (error || !data) {
    throw new Error(`Could not download ${storagePath} for MIME repair: ${getErrorMessage(error) || "missing object"}`);
  }
  const body = await data.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("videos")
    .upload(storagePath, body, {
      cacheControl: "3600",
      contentType: "video/mp4",
      upsert: true,
    });
  if (uploadError) throw uploadError;
}

async function repairVideoUrls(dryRun: boolean, repairMime: boolean) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("id,title,video_url,storage_path,moderation_state")
    .not("storage_path", "is", null);

  if (error) {
    if (isModerationHoldColumnError(error)) {
      throw new Error("Catalog moderation_state is not available until migration 202610172000 is applied.");
    }
    throw error;
  }

  const clearRows = (data || []).filter((row) => isCatalogItemPubliclyPlayable(row as Record<string, unknown>));

  const candidates = clearRows
    .filter((row) => typeof row.storage_path === "string" && row.storage_path.trim())
    .map((row) => ({
      id: String(row.id),
      title: String(row.title || ""),
      before: String(row.video_url || ""),
      storagePath: String(row.storage_path || ""),
      after: getGuardedVideoRepairUrl(String(row.storage_path || ""), String(row.id || "")),
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
    const rowsWithStoragePaths = clearRows
      .filter((row) => typeof row.storage_path === "string" && row.storage_path.trim())
      .map((row) => ({
        id: String(row.id),
        title: String(row.title || ""),
        storagePath: String(row.storage_path || ""),
        publicUrl: getGuardedVideoRepairUrl(String(row.storage_path || ""), String(row.id || "")),
      }))
      .filter((row) => row.publicUrl);

    for (const row of rowsWithStoragePaths) {
      const probe = await probeStorageObjectContentType(supabase, row.storagePath);
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
          await repairStorageMp4Metadata(supabase, row.storagePath);
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
    const owner = await requireAuthenticatedPlatformOwner(request, "/api/videos/repair-urls");
    if (!owner.ok) {
      return jsonResponse({ error: owner.error }, owner.status);
    }
    return jsonResponse(await repairVideoUrls(true, shouldRepairMime(request)));
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireAuthenticatedPlatformOwner(request, "/api/videos/repair-urls");
    if (!owner.ok) {
      return jsonResponse({ error: owner.error }, owner.status);
    }
    return jsonResponse(await repairVideoUrls(false, shouldRepairMime(request)));
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
