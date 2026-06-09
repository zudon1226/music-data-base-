import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const VIDEOS_BUCKET = "videos";
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const DEFAULT_VIDEO_COVER = "/music-data-base-logo.png";
const REMOVED_PLACEHOLDER_IMAGES = [
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
];
function cleanStorageFileName(fileName: string) {
    const fallbackExtension = "mp4";
    const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || fallbackExtension;
    const baseName = fileName
        .replace(/\.[^/.]+$/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
    return `${baseName || "video"}.${extension || fallbackExtension}`;
}
function getErrorMessage(error: unknown) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "string")
        return error;
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        const message = ["message", "error", "code", "details", "hint", "status", "statusCode"]
            .map((key) => record[key])
            .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
            .map(String)
            .join(" ");
        return message || JSON.stringify(record);
    }
    return "Unknown server error";
}
function getErrorDetails(error: unknown) {
    if (!error || typeof error !== "object")
        return error;
    const record = error as Record<string, unknown>;
    const details: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(error)) {
        details[key] = record[key];
    }
    for (const key of ["message", "error", "name", "status", "statusCode", "code", "details", "hint"]) {
        if (record[key] !== undefined) {
            details[key] = record[key];
        }
    }
    return details;
}
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function getArtworkUrl(value: string) {
    const cleanValue = value.trim();
    return cleanValue && !REMOVED_PLACEHOLDER_IMAGES.includes(cleanValue) ? cleanValue : DEFAULT_VIDEO_COVER;
}
function getFormFile(value: FormDataEntryValue | null) {
    if (value &&
        typeof value === "object" &&
        "arrayBuffer" in value &&
        typeof value.arrayBuffer === "function" &&
        "size" in value &&
        typeof value.size === "number") {
        return value as File;
    }
    return null;
}
export async function POST(request: Request) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
        if (!supabaseUrl) {
            return jsonResponse({ error: "NEXT_PUBLIC_SUPABASE_URL is missing." }, 500);
        }
        if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
            return jsonResponse({ error: "SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value." }, 500);
        }
        const formData = await request.formData();
        const file = getFormFile(formData.get("file"));
        const userId = String(formData.get("userId") || "").trim() || "uploads";
        const title = String(formData.get("title") || "").trim() || "Untitled video";
        const description = String(formData.get("description") || "").trim();
        const artistName = String(formData.get("artist_name") || formData.get("artist") || description || "").trim();
        const artistId = String(formData.get("artist_id") || "").trim() || userId;
        const category = String(formData.get("category") || "").trim() || "Music Video";
        const thumbnailUrl = getArtworkUrl(String(formData.get("thumbnail_url") || ""));
        const producer = String(formData.get("producer") || "").trim();
        const producerName = String(formData.get("producer_name") || producer || "").trim();
        const producerId = String(formData.get("producer_id") || "").trim();
        const producerProfileId = String(formData.get("producer_profile_id") || producerId || "").trim();
        const beatId = String(formData.get("beat_id") || "").trim();
        const albumId = String(formData.get("album_id") || "").trim();
        if (!file) {
            return jsonResponse({ error: "Choose a video file before uploading." }, 400);
        }
        if (file.size > MAX_VIDEO_SIZE) {
            return jsonResponse({
                error: "Video is too large. Please test with a video under 500 MB or upgrade Supabase storage limits.",
                details: { fileSize: file.size, maxVideoBytes: MAX_VIDEO_SIZE },
            }, 413);
        }
        const contentType = file.type || "video/mp4";
        if (!contentType.startsWith("video/")) {
            return jsonResponse({ error: "Only video files can be uploaded.", details: { contentType } }, 400);
        }
        const cleanFileName = cleanStorageFileName(file.name || "video.mp4");
        const filePath = `${Date.now()}-${cleanFileName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
        const { data, error } = await supabase.storage.from(VIDEOS_BUCKET).upload(filePath, buffer, {
            cacheControl: "3600",
            contentType,
            upsert: true,
        });
        if (error) {
            console.error("[api/upload-video] Supabase upload error:", error);
            return jsonResponse({
                error: getErrorMessage(error),
                details: getErrorDetails(error),
            }, 500);
        }
        const { data: publicUrlData } = supabase.storage.from(VIDEOS_BUCKET).getPublicUrl(filePath);
        if (!publicUrlData.publicUrl) {
            return jsonResponse({ error: "Supabase did not return a public URL for the uploaded video." }, 500);
        }
        const createdAt = new Date().toISOString();
        const videoRow = {
            id: crypto.randomUUID(),
            title,
            description,
            artist_name: artistName || description || "Unknown artist",
            artist_id: artistId || null,
            producer,
            producer_name: producerName || producer || null,
            producer_id: producerId || null,
            producer_profile_id: producerProfileId || null,
            beat_id: beatId || null,
            album_id: albumId || null,
            category,
            video_url: publicUrlData.publicUrl,
            cover_url: thumbnailUrl,
            storage_path: data?.path || filePath,
            thumbnail_url: thumbnailUrl,
            views: 0,
            likes: 0,
            created_at: createdAt,
            user_id: userId,
        };
        const insertVideoRow = async (row: Record<string, unknown>, selectColumns: string) => supabase
            .from("videos")
            .insert(row)
            .select(selectColumns)
            .single();
        const initialInsert = await insertVideoRow(videoRow, "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at,user_id");
        let savedVideo = initialInsert.data as Record<string, unknown> | null;
        let tableError = initialInsert.error;
        if (tableError && getErrorMessage(tableError).toLowerCase().includes("user_id")) {
            const fallbackVideoRow: Record<string, unknown> = { ...videoRow };
            delete fallbackVideoRow.user_id;
            const fallbackResult = await insertVideoRow(fallbackVideoRow, "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,album_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at");
            savedVideo = fallbackResult.data as Record<string, unknown> | null;
            tableError = fallbackResult.error;
        }
        if (tableError && /producer|artist|cover_url|beat_id/i.test(getErrorMessage(tableError))) {
            const fallbackVideoRow: Record<string, unknown> = { ...videoRow };
            delete fallbackVideoRow.producer;
            delete fallbackVideoRow.producer_name;
            delete fallbackVideoRow.producer_id;
            delete fallbackVideoRow.producer_profile_id;
            delete fallbackVideoRow.artist_name;
            delete fallbackVideoRow.artist_id;
            delete fallbackVideoRow.cover_url;
            delete fallbackVideoRow.beat_id;
            const fallbackResult = await insertVideoRow(fallbackVideoRow, "id,title,description,album_id,category,video_url,storage_path,thumbnail_url,views,likes,created_at,user_id");
            savedVideo = fallbackResult.data as Record<string, unknown> | null;
            tableError = fallbackResult.error;
        }
        if (tableError && getErrorMessage(tableError).toLowerCase().includes("album_id")) {
            const fallbackVideoRow: Record<string, unknown> = { ...videoRow };
            delete fallbackVideoRow.album_id;
            const fallbackResult = await insertVideoRow(fallbackVideoRow, "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,beat_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at,user_id");
            savedVideo = fallbackResult.data as Record<string, unknown> | null;
            tableError = fallbackResult.error;
        }
        if (tableError) {
            console.error("VIDEO INSERT FAILED", tableError);
            console.error("[api/upload-video] INSERT FAILED public.videos:", tableError);
            await supabase.storage.from(VIDEOS_BUCKET).remove([videoRow.storage_path]);
            return jsonResponse({
                error: `Video uploaded to Storage, but the videos table save failed: ${getErrorMessage(tableError)}`,
                details: getErrorDetails(tableError),
            }, 500);
        }
        return jsonResponse({
            publicUrl: publicUrlData.publicUrl,
            storagePath: data?.path || filePath,
            video: savedVideo || videoRow,
        });
    }
    catch (error) {
        console.error("[api/upload-video] Server error:", error);
        return jsonResponse({
            error: getErrorMessage(error),
            details: getErrorDetails(error),
        }, 500);
    }
}
