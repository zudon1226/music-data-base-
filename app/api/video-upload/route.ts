import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEOS_BUCKET = "videos";
const SERVER_VIDEO_UPLOAD_FALLBACK_MAX_BYTES = 3 * 1024 * 1024;

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

function getRecordString(record: Record<string, unknown>, keys: string[], fallback = "") {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            return String(value);
        }
    }
    return fallback;
}

function getNullableRecordString(record: Record<string, unknown>, keys: string[]) {
    const value = getRecordString(record, keys);
    if (!value || value === "null" || value === "undefined") {
        return null;
    }
    return value;
}

function getRecordNumber(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
            return Number(value);
        }
    }
    return null;
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

function getVideoContentType(file: File) {
    const browserType = file.type.trim().toLowerCase();
    if (browserType && browserType.startsWith("video/")) {
        return browserType;
    }
    const extension = getFileExtension(file.name);
    if (extension === "mov")
        return "video/quicktime";
    if (extension === "webm")
        return "video/webm";
    if (extension === "m4v")
        return "video/x-m4v";
    return "video/mp4";
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getPublicVideoUrl(supabase: ReturnType<typeof getSupabaseServerClient>, storagePath: string) {
    return supabase.storage.from(VIDEOS_BUCKET).getPublicUrl(storagePath).data.publicUrl || "";
}

async function probePublicVideoUrl(publicUrl: string) {
    let response = await fetch(publicUrl, { method: "HEAD", cache: "no-store" });
    if (response.status === 405 || response.status === 403) {
        response = await fetch(publicUrl, {
            method: "GET",
            cache: "no-store",
            headers: { Range: "bytes=0-0" },
        });
    }
    return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type") || "",
        contentLength: response.headers.get("content-length") || "",
    };
}

async function verifyUploadedVideoObject(supabase: ReturnType<typeof getSupabaseServerClient>, storagePath: string, publicUrl: string) {
    const download = await supabase.storage.from(VIDEOS_BUCKET).download(storagePath);
    if (download.error) {
        throw new Error(`Uploaded video object could not be read from storage: ${getErrorMessage(download.error)}`);
    }
    const probe = await probePublicVideoUrl(publicUrl);
    if (!probe.ok || probe.status !== 200) {
        throw new Error(`Uploaded video public URL did not return 200. HTTP ${probe.status}`);
    }
    if (!probe.contentType.toLowerCase().startsWith("video/")) {
        throw new Error(`Uploaded video public URL returned unexpected content-type: ${probe.contentType || "none"}`);
    }
    return probe;
}

async function cleanupUploadedVideoObject(supabase: ReturnType<typeof getSupabaseServerClient>, storagePath: string) {
    if (!storagePath) return null;
    const { error } = await supabase.storage.from(VIDEOS_BUCKET).remove([storagePath]);
    return error ? getErrorMessage(error) : null;
}

const OPTIONAL_VIDEO_INSERT_COLUMNS = [
    "description",
    "artist_name",
    "artist_id",
    "producer",
    "producer_name",
    "producer_id",
    "producer_profile_id",
    "album_id",
    "category",
    "cover_url",
    "thumbnail_url",
    "file_name",
    "file_size",
    "video_codec",
    "audio_codec",
    "mobile_compatible",
    "views",
    "likes",
    "created_at",
    "user_id",
];

async function insertVideoRowWithFallback(supabase: ReturnType<typeof getSupabaseServerClient>, videoRow: Record<string, unknown>) {
    let nextRow = { ...videoRow };
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const selectColumns = Object.keys(nextRow).join(",");
        const result = await supabase.from("videos").insert(nextRow).select(selectColumns).single();
        if (!result.error && result.data) {
            return result;
        }
        lastError = result.error;
        const message = getErrorMessage(result.error).toLowerCase();
        const missingColumns = OPTIONAL_VIDEO_INSERT_COLUMNS.filter((column) => message.includes(column.toLowerCase()) && column in nextRow);
        if (missingColumns.length === 0) {
            return result;
        }
        nextRow = { ...nextRow };
        for (const column of missingColumns) {
            delete nextRow[column];
        }
    }
    return { data: null, error: lastError };
}

function assertSavedVideoRow(video: Record<string, unknown>, storagePath: string, publicUrl: string) {
    const savedId = String(video.id || "");
    const savedStoragePath = String(video.storage_path || "");
    const savedVideoUrl = String(video.video_url || "");
    if (!isUuid(savedId)) {
        throw new Error("Saved video row does not have a real UUID id.");
    }
    if (savedStoragePath !== storagePath) {
        throw new Error("Saved video row storage_path does not match the uploaded file path.");
    }
    if (savedVideoUrl !== publicUrl) {
        throw new Error("Saved video row video_url does not match the generated public URL.");
    }
}

export async function GET() {
    return jsonResponse({
        ok: true,
        route: "/api/video-upload",
        method: "POST",
        message: "Upload the video directly to Supabase Storage, then POST JSON metadata with publicUrl, storagePath, userId, and sessionUserId.",
    });
}

export async function OPTIONS() {
    return jsonResponse({ ok: true, methods: ["POST"] });
}

export async function POST(request: Request) {
    try {
        const contentTypeHeader = request.headers.get("content-type") || "";
        if (contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
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
            if (file.size > SERVER_VIDEO_UPLOAD_FALLBACK_MAX_BYTES) {
                return jsonResponse({
                    error: "Supabase Storage CORS is blocking direct video upload, and this file is too large for the server fallback. Add https://digitalmusicdatabase.com and https://www.digitalmusicdatabase.com to Supabase Storage/API CORS allowed origins, then retry.",
                    fileSize: file.size,
                    fallbackLimit: SERVER_VIDEO_UPLOAD_FALLBACK_MAX_BYTES,
                }, 413);
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
                console.error("[api/video-upload] Supabase Storage fallback upload error:", uploadError);
                return jsonResponse({ error: getErrorMessage(uploadError), details: getErrorDetails(uploadError) }, 500);
            }

            const publicUrl = getPublicVideoUrl(supabase, storagePath);
            if (!publicUrl) {
                return jsonResponse({ error: "Supabase did not return a public URL for the uploaded video." }, 500);
            }
            const publicProbe = await verifyUploadedVideoObject(supabase, storagePath, publicUrl);

            return jsonResponse({
                publicUrl,
                storagePath,
                fileName: file.name || cleanFileName,
                fileSize: file.size,
                contentType,
                verification: {
                    storageObjectExists: true,
                    publicUrlStatus: publicProbe.status,
                    contentType: publicProbe.contentType,
                    contentLength: publicProbe.contentLength,
                },
            });
        }

        if (contentTypeHeader.toLowerCase().includes("application/json")) {
            const body = await request.json() as Record<string, unknown>;
            const sessionUserId = getRecordString(body, ["sessionUserId"]);
            const userId = getRecordString(body, ["userId"]);
            const authUserId = sessionUserId || userId;
            const providedPublicUrl = getRecordString(body, ["publicUrl", "video_url", "videoUrl"]);
            const storagePath = getRecordString(body, ["storagePath", "storage_path"]);
            const fileName = getRecordString(body, ["fileName", "file_name"], storagePath.split("/").pop() || "video.mp4");
            const fileSize = getRecordNumber(body, ["fileSize", "file_size"]);
            const videoCodec = getNullableRecordString(body, ["video_codec", "videoCodec"]);
            const audioCodec = getNullableRecordString(body, ["audio_codec", "audioCodec"]);
            const rawMobileCompatible = body.mobile_compatible ?? body.mobileCompatible;
            const mobileCompatible = typeof rawMobileCompatible === "boolean" ? rawMobileCompatible : null;
            const cleanupOnFailure = body.cleanupOnFailure === true;

            if (!authUserId) {
                return jsonResponse({ error: "You must log in again before uploading a video." }, 401);
            }
            if (sessionUserId && userId && sessionUserId !== userId) {
                return jsonResponse({ error: "Video upload user id does not match the signed-in session." }, 401);
            }
            if (!providedPublicUrl || !storagePath) {
                return jsonResponse({ error: "Video metadata is missing the Supabase Storage URL or path." }, 400);
            }
            const supabase = getSupabaseServerClient();
            const publicUrl = getPublicVideoUrl(supabase, storagePath);
            if (!publicUrl) {
                return jsonResponse({ error: "Supabase did not return a public URL for the uploaded video." }, 500);
            }
            if (providedPublicUrl !== publicUrl) {
                return jsonResponse({
                    error: "Video metadata public URL does not match the uploaded storage path.",
                    details: { providedPublicUrl, generatedPublicUrl: publicUrl, storagePath },
                }, 400);
            }
            let publicProbe: Awaited<ReturnType<typeof verifyUploadedVideoObject>>;
            try {
                publicProbe = await verifyUploadedVideoObject(supabase, storagePath, publicUrl);
            }
            catch (verificationError) {
                const cleanupError = cleanupOnFailure ? await cleanupUploadedVideoObject(supabase, storagePath) : null;
                return jsonResponse({
                    error: getErrorMessage(verificationError),
                    details: {
                        storagePath,
                        publicUrl,
                        cleanupOnFailure,
                        cleanupError,
                    },
                }, 500);
            }

            const createdAt = new Date().toISOString();
            const videoTitle = getRecordString(body, ["title"], fileName.replace(/\.[^/.]+$/, "") || "Untitled video");
            const artistName = getRecordString(body, ["artist_name", "artistName", "creator", "description"], "Unknown creator");
            const producerName = getRecordString(body, ["producer_name", "producerName", "producer"]);
            const producerId = getNullableRecordString(body, ["producer_id", "producerId"]);
            const producerProfileId = getNullableRecordString(body, ["producer_profile_id", "producerProfileId"]) || producerId;
            const albumId = getNullableRecordString(body, ["album_id", "albumId"]);
            const coverUrl = getRecordString(body, ["cover_url", "coverUrl", "cover", "thumbnail_url", "thumbnailUrl"], "/music-data-base-logo.png");
            const videoRow: Record<string, unknown> = {
                id: crypto.randomUUID(),
                user_id: authUserId,
                artist_id: getRecordString(body, ["artist_id", "artistId"], authUserId),
                title: videoTitle,
                description: getRecordString(body, ["description"], artistName),
                artist_name: artistName,
                producer: producerName,
                producer_name: producerName,
                producer_id: producerId,
                producer_profile_id: producerProfileId,
                album_id: albumId,
                category: getRecordString(body, ["category"], "Music Video"),
                video_url: publicUrl,
                cover_url: coverUrl,
                thumbnail_url: coverUrl,
                storage_path: storagePath,
                file_name: fileName,
                file_size: fileSize,
                video_codec: videoCodec,
                audio_codec: audioCodec,
                mobile_compatible: mobileCompatible,
                views: 0,
                likes: 0,
                created_at: createdAt,
            };
            let videoInsert = await insertVideoRowWithFallback(supabase, videoRow);
            if (videoInsert.error) {
                console.error("[api/video-upload] Supabase videos metadata insert error:", videoInsert.error);
                const cleanupError = cleanupOnFailure ? await cleanupUploadedVideoObject(supabase, storagePath) : null;
                return jsonResponse({
                    error: getErrorMessage(videoInsert.error),
                    details: {
                        ...((getErrorDetails(videoInsert.error) || {}) as Record<string, unknown>),
                        insertPayload: videoRow,
                        insertUserId: authUserId,
                        authUserId,
                        cleanupOnFailure,
                        cleanupError,
                    },
                }, 500);
            }
            try {
                assertSavedVideoRow(videoInsert.data as unknown as Record<string, unknown>, storagePath, publicUrl);
            }
            catch (verificationError) {
                const cleanupError = cleanupOnFailure ? await cleanupUploadedVideoObject(supabase, storagePath) : null;
                return jsonResponse({
                    error: getErrorMessage(verificationError),
                    details: {
                        savedVideo: videoInsert.data,
                        storagePath,
                        publicUrl,
                        cleanupOnFailure,
                        cleanupError,
                    },
                }, 500);
            }

            return jsonResponse({
                publicUrl,
                storagePath,
                fileName,
                fileSize,
                contentType: publicProbe.contentType || getRecordString(body, ["contentType", "content_type"]),
                verification: {
                    storageObjectExists: true,
                    publicUrlStatus: publicProbe.status,
                    contentType: publicProbe.contentType,
                    contentLength: publicProbe.contentLength,
                    rowHasRealUuid: true,
                    storagePathMatches: true,
                    videoUrlMatches: true,
                },
                video: videoInsert.data,
            });
        }

        return jsonResponse({
            error: "Upload videos directly to Supabase Storage from the browser, then send only JSON metadata to this route.",
        }, 413);
    }
    catch (error) {
        console.error("[api/video-upload] Server error:", error);
        return jsonResponse({ error: getErrorMessage(error), details: getErrorDetails(error) }, 500);
    }
}
