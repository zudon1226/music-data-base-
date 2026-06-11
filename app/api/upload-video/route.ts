import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEOS_BUCKET = "videos";
const DEFAULT_VIDEO_COVER = "/music-data-base-logo.png";
const ACCEPTED_VIDEO_TYPES = new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-m4v",
    "video/mov",
]);
const VIDEO_CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/x-m4v",
};

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

function getFileExtension(fileName: string) {
    return fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
}

function cleanStorageFileName(fileName: string) {
    const extension = getFileExtension(fileName) || "mp4";
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

function getVideoContentType(file: File) {
    const browserType = file.type.trim().toLowerCase();
    if (browserType && (ACCEPTED_VIDEO_TYPES.has(browserType) || browserType.startsWith("video/"))) {
        return browserType;
    }
    const extension = getFileExtension(file.name);
    return VIDEO_CONTENT_TYPES_BY_EXTENSION[extension] || "video/mp4";
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
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

function getArtworkUrl(value: string) {
    return value.trim() || DEFAULT_VIDEO_COVER;
}

function removeKeys(row: Record<string, unknown>, keys: string[]) {
    const next = { ...row };
    for (const key of keys) {
        delete next[key];
    }
    return next;
}

export async function POST(request: Request) {
    let uploadedStoragePath = "";
    let lastInsertPayload: Record<string, unknown> = {};
    try {
        const formData = await request.formData();
        const file = getFormFile(formData.get("file"));
        const sessionUserId = String(formData.get("sessionUserId") || "").trim();
        const legacyUserId = String(formData.get("userId") || "").trim();
        const authUserId = sessionUserId || legacyUserId;
        const title = String(formData.get("title") || "").trim() || "Untitled video";
        const creator = String(formData.get("creator") || "").trim() || "Unknown creator";
        const category = String(formData.get("category") || "").trim() || "Music Video";
        const coverUrl = getArtworkUrl(String(formData.get("cover_url") || ""));
        const producerId = String(formData.get("producer_id") || "").trim();
        const producerName = String(formData.get("producer_name") || "").trim();
        const albumId = String(formData.get("album_id") || "").trim();

        if (!file) {
            return jsonResponse({ error: "Choose a video file." }, 400);
        }
        if (!authUserId) {
            return jsonResponse({ error: "You must log in again before saving video metadata." }, 401);
        }
        if (sessionUserId && legacyUserId && sessionUserId !== legacyUserId) {
            console.error("VIDEO USER ID MISMATCH", {
                sessionUserId,
                userId: legacyUserId,
            });
            return jsonResponse({ error: "Video metadata user id does not match the signed-in session." }, 401);
        }

        const contentType = getVideoContentType(file);
        if (!contentType.startsWith("video/")) {
            return jsonResponse({ error: "Only video files can be uploaded.", details: { contentType } }, 400);
        }

        const cleanFileName = cleanStorageFileName(file.name || "video.mp4");
        const storagePath = `${authUserId}/${Date.now()}-${crypto.randomUUID()}-${cleanFileName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const supabase = getSupabaseServerClient();

        const { error: uploadError } = await supabase.storage.from(VIDEOS_BUCKET).upload(storagePath, buffer, {
            cacheControl: "3600",
            contentType,
            upsert: true,
        });
        if (uploadError) {
            console.error("[api/upload-video] Supabase Storage upload error:", uploadError);
            return jsonResponse({ error: getErrorMessage(uploadError), details: getErrorDetails(uploadError) }, 500);
        }
        uploadedStoragePath = storagePath;

        const { data: publicUrlData } = supabase.storage.from(VIDEOS_BUCKET).getPublicUrl(storagePath);
        const publicUrl = publicUrlData.publicUrl;
        if (!publicUrl) {
            await supabase.storage.from(VIDEOS_BUCKET).remove([storagePath]);
            return jsonResponse({ error: "Supabase did not return a public URL for the uploaded video." }, 500);
        }

        const createdAt = new Date().toISOString();
        const videoRow: Record<string, unknown> = {
            id: crypto.randomUUID(),
            user_id: authUserId,
            artist_id: authUserId,
            title,
            description: creator,
            artist_name: creator,
            producer: producerName,
            producer_name: producerName,
            producer_id: producerId || null,
            producer_profile_id: producerId || null,
            album_id: albumId || null,
            category,
            video_url: publicUrl,
            cover_url: coverUrl,
            thumbnail_url: coverUrl,
            storage_path: storagePath,
            file_name: file.name || cleanFileName,
            file_size: file.size,
            views: 0,
            likes: 0,
            created_at: createdAt,
        };

        const insertAttempts = [
            {
                row: videoRow,
                select: "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,album_id,category,video_url,cover_url,storage_path,file_name,file_size,thumbnail_url,views,likes,created_at,user_id",
            },
            {
                row: removeKeys(videoRow, ["file_name", "file_size", "album_id"]),
                select: "id,title,description,artist_name,artist_id,producer,producer_name,producer_id,producer_profile_id,category,video_url,cover_url,storage_path,thumbnail_url,views,likes,created_at,user_id",
            },
            {
                row: removeKeys(videoRow, ["artist_id", "producer", "producer_name", "producer_profile_id", "album_id", "cover_url", "thumbnail_url", "file_name", "file_size"]),
                select: "id,title,description,artist_name,producer_id,category,video_url,storage_path,views,likes,created_at,user_id",
            },
            {
                row: {
                    id: videoRow.id,
                    user_id: videoRow.user_id,
                    title: videoRow.title,
                    artist_name: videoRow.artist_name,
                    producer_id: videoRow.producer_id,
                    video_url: videoRow.video_url,
                    storage_path: videoRow.storage_path,
                    created_at: videoRow.created_at,
                },
                select: "id,title,artist_name,producer_id,video_url,storage_path,created_at,user_id",
            },
        ];

        let savedVideo: Record<string, unknown> | null = null;
        let tableError: unknown = null;
        for (const attempt of insertAttempts) {
            lastInsertPayload = attempt.row;
            console.error("INSERT USER ID:", attempt.row.user_id);
            console.error("AUTH USER ID:", authUserId);
            console.error("FULL INSERT PAYLOAD:", attempt.row);
            const result = await supabase
                .from("videos")
                .insert(attempt.row)
                .select(attempt.select)
                .single();
            if (!result.error) {
                savedVideo = result.data as unknown as Record<string, unknown>;
                tableError = null;
                break;
            }
            tableError = result.error;
        }

        if (tableError || !savedVideo) {
            console.error("VIDEO INSERT FAILED", tableError);
            await supabase.storage.from(VIDEOS_BUCKET).remove([storagePath]);
            return jsonResponse({
                error: `Video uploaded to Storage, but the videos table save failed: ${getErrorMessage(tableError)}`,
                details: {
                    supabaseError: getErrorDetails(tableError),
                    insertUserId: String(lastInsertPayload.user_id || ""),
                    authUserId,
                    userIdMatchesAuth: String(lastInsertPayload.user_id || "") === authUserId,
                    insertPayload: lastInsertPayload,
                },
            }, 500);
        }

        return jsonResponse({
            publicUrl,
            storagePath,
            video: savedVideo,
        });
    }
    catch (error) {
        console.error("[api/upload-video] Server error:", error);
        if (uploadedStoragePath) {
            try {
                const supabase = getSupabaseServerClient();
                await supabase.storage.from(VIDEOS_BUCKET).remove([uploadedStoragePath]);
            }
            catch (cleanupError) {
                console.error("[api/upload-video] Cleanup failed:", cleanupError);
            }
        }
        return jsonResponse({ error: getErrorMessage(error), details: getErrorDetails(error) }, 500);
    }
}
