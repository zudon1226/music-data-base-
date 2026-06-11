import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEOS_BUCKET = "videos";
const MAX_VIDEO_UPLOAD_SIZE = 500 * 1024 * 1024;

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
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

function getJwtRole(token: string) {
    const [, payload] = token.split(".");
    if (!payload) {
        return "";
    }
    try {
        const decoded = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const claims = JSON.parse(decoded) as { role?: unknown };
        return typeof claims.role === "string" ? claims.role : "";
    }
    catch {
        return "";
    }
}

function getSupabaseServerClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }
    const keyRole = getJwtRole(serviceRoleKey);
    if (keyRole !== "service_role") {
        throw new Error(`SUPABASE_SERVICE_ROLE_KEY must be the Supabase service_role key. Current key role: ${keyRole || "unknown"}.`);
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
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

function getFormString(formData: FormData, keys: string[], fallback = "") {
    for (const key of keys) {
        const value = formData.get(key);
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }
    return fallback;
}

function getNullableFormString(formData: FormData, keys: string[]) {
    const value = getFormString(formData, keys);
    if (!value || value === "null" || value === "undefined") {
        return null;
    }
    return value;
}

function getFileExtension(fileName: string) {
    return fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
}

function cleanStorageFileName(fileName: string) {
    const extension = getFileExtension(fileName);
    const baseName = fileName
        .replace(/\.[^/.]+$/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
    return `${baseName || "video"}.${extension}`;
}

function normalizeVideoContentType(contentType: string, fileName: string) {
    const browserType = contentType.trim().toLowerCase();
    if (browserType && browserType.startsWith("video/")) {
        return browserType;
    }
    const extension = getFileExtension(fileName);
    if (extension === "mov")
        return "video/quicktime";
    if (extension === "webm")
        return "video/webm";
    if (extension === "m4v")
        return "video/x-m4v";
    return "video/mp4";
}

export async function GET() {
    return jsonResponse({
        ok: true,
        route: "/api/video-upload",
        method: "POST",
        message: "Send multipart FormData with file, userId, and sessionUserId fields.",
    });
}

export async function OPTIONS() {
    return jsonResponse({ ok: true, methods: ["POST"] });
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = getFormFile(formData.get("file"));
        const sessionUserId = String(formData.get("sessionUserId") || "").trim();
        const userId = String(formData.get("userId") || "").trim();
        const authUserId = sessionUserId || userId;

        if (!file) {
            return jsonResponse({ error: "Choose a video file." }, 400);
        }
        if (!authUserId) {
            return jsonResponse({ error: "You must log in again before uploading a video." }, 401);
        }
        if (sessionUserId && userId && sessionUserId !== userId) {
            return jsonResponse({ error: "Video upload user id does not match the signed-in session." }, 401);
        }
        if (file.size > MAX_VIDEO_UPLOAD_SIZE) {
            return jsonResponse({ error: "Video is too large. Upload a file up to 500 MB." }, 413);
        }

        const fileName = file.name || "video.mp4";
        const contentType = normalizeVideoContentType(file.type || "", fileName);
        if (!contentType.startsWith("video/")) {
            return jsonResponse({ error: "Only video files can be uploaded.", details: { contentType } }, 400);
        }

        const cleanFileName = cleanStorageFileName(fileName);
        const storagePath = `${authUserId}/${Date.now()}-${crypto.randomUUID()}-${cleanFileName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const supabase = getSupabaseServerClient();
        const { data, error: uploadError } = await supabase.storage
            .from(VIDEOS_BUCKET)
            .upload(storagePath, buffer, {
                cacheControl: "3600",
                contentType,
                upsert: true,
            });

        if (uploadError) {
            console.error("[api/video-upload] Supabase Storage upload error:", uploadError);
            return jsonResponse({ error: getErrorMessage(uploadError), details: getErrorDetails(uploadError) }, 500);
        }

        const savedStoragePath = data?.path || storagePath;
        const { data: publicUrlData } = supabase.storage.from(VIDEOS_BUCKET).getPublicUrl(savedStoragePath);
        if (!publicUrlData.publicUrl) {
            return jsonResponse({ error: "Supabase did not return a public URL for the uploaded video." }, 500);
        }

        const createdAt = new Date().toISOString();
        const videoTitle = getFormString(formData, ["title"], fileName.replace(/\.[^/.]+$/, "") || "Untitled video");
        const artistName = getFormString(formData, ["artist_name", "artistName", "creator", "description"], "Unknown creator");
        const producerName = getFormString(formData, ["producer_name", "producerName", "producer"]);
        const producerId = getNullableFormString(formData, ["producer_id", "producerId"]);
        const producerProfileId = getNullableFormString(formData, ["producer_profile_id", "producerProfileId"]) || producerId;
        const albumId = getNullableFormString(formData, ["album_id", "albumId"]);
        const coverUrl = getFormString(formData, ["cover_url", "coverUrl", "cover", "thumbnail_url", "thumbnailUrl"], "/music-data-base-logo.png");
        const videoRow: Record<string, unknown> = {
            id: crypto.randomUUID(),
            user_id: authUserId,
            artist_id: getFormString(formData, ["artist_id", "artistId"], authUserId),
            title: videoTitle,
            description: getFormString(formData, ["description"], artistName),
            artist_name: artistName,
            producer: producerName,
            producer_name: producerName,
            producer_id: producerId,
            producer_profile_id: producerProfileId,
            album_id: albumId,
            category: getFormString(formData, ["category"], "Music Video"),
            video_url: publicUrlData.publicUrl,
            cover_url: coverUrl,
            thumbnail_url: coverUrl,
            storage_path: savedStoragePath,
            file_name: fileName,
            file_size: file.size,
            views: 0,
            likes: 0,
            created_at: createdAt,
        };
        const initialSelectColumns = [
            "id",
            "title",
            "description",
            "artist_name",
            "artist_id",
            "producer",
            "producer_name",
            "producer_id",
            "producer_profile_id",
            "album_id",
            "category",
            "video_url",
            "cover_url",
            "storage_path",
            "file_name",
            "file_size",
            "thumbnail_url",
            "views",
            "likes",
            "created_at",
            "user_id",
        ].join(",");
        const fallbackVideoRow: Record<string, unknown> = {
            id: videoRow.id,
            user_id: videoRow.user_id,
            title: videoRow.title,
            artist_name: videoRow.artist_name,
            producer_id: videoRow.producer_id,
            video_url: videoRow.video_url,
            storage_path: videoRow.storage_path,
            created_at: videoRow.created_at,
        };
        const fallbackSelectColumns = [
            "id",
            "title",
            "artist_name",
            "producer_id",
            "video_url",
            "storage_path",
            "created_at",
            "user_id",
        ].join(",");
        let videoInsert = await supabase.from("videos").insert(videoRow).select(initialSelectColumns).single();
        if (videoInsert.error && /file_name|file_size|album_id|artist_id|producer|cover_url|thumbnail_url/i.test(getErrorMessage(videoInsert.error))) {
            videoInsert = await supabase.from("videos").insert(fallbackVideoRow).select(fallbackSelectColumns).single();
        }
        if (videoInsert.error) {
            console.error("[api/video-upload] Supabase videos insert error:", videoInsert.error);
            return jsonResponse({
                error: getErrorMessage(videoInsert.error),
                details: {
                    ...((getErrorDetails(videoInsert.error) || {}) as Record<string, unknown>),
                    insertPayload: videoRow,
                    insertUserId: authUserId,
                    authUserId,
                },
            }, 500);
        }

        return jsonResponse({
            publicUrl: publicUrlData.publicUrl,
            storagePath: savedStoragePath,
            fileName,
            fileSize: file.size,
            contentType,
            video: videoInsert.data,
        });
    }
    catch (error) {
        console.error("[api/video-upload] Server error:", error);
        return jsonResponse({ error: getErrorMessage(error), details: getErrorDetails(error) }, 500);
    }
}
