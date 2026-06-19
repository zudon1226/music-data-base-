import { NextResponse } from "next/server";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getSupabaseLibraryClient } from "@/lib/server-supabase";
import { readSupabaseLibraryApiKey, SUPABASE_PROJECT_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEOS_BUCKET = "videos";

function decodeJwtPayload(key: string) {
    try {
        const payload = key.split(".")[1];
        if (!payload) {
            return null;
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as { iss?: string; ref?: string; role?: string };
    }
    catch {
        return null;
    }
}

function describeServerStorageAuth() {
    const apiKey = readSupabaseLibraryApiKey();
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^["']|["']$/g, "");
    const keySource = serviceRoleKey && apiKey === serviceRoleKey
        ? "SUPABASE_SERVICE_ROLE_KEY"
        : "NEXT_PUBLIC_SUPABASE_ANON_KEY (library fallback)";
    return {
        supabaseUrl: SUPABASE_PROJECT_URL,
        keySource,
        serviceRoleKeyUsed: keySource === "SUPABASE_SERVICE_ROLE_KEY",
        jwtPayload: decodeJwtPayload(apiKey),
    };
}

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

async function getVerifiedUploadUserId(request: Request, providedUserIds: string[]) {
    const claimedUserId = providedUserIds.find((userId) => userId?.trim()) || "";
    const auth = await requireMatchingUserId(request, "/api/video-upload", claimedUserId);
    if (!auth.ok) {
        throw new Error(auth.error);
    }
    return auth.userId;
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

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getNullableUuid(value: string | null) {
    const cleanValue = String(value || "").trim();
    return cleanValue && isUuid(cleanValue) ? cleanValue : null;
}

function getPublicVideoUrl(supabase: ReturnType<typeof getSupabaseLibraryClient>, storagePath: string) {
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

async function verifyUploadedVideoObject(supabase: ReturnType<typeof getSupabaseLibraryClient>, storagePath: string, publicUrl: string) {
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

async function cleanupUploadedVideoObject(supabase: ReturnType<typeof getSupabaseLibraryClient>, storagePath: string) {
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
];

const VIDEO_INSERT_SELECT_COLUMNS = [
    "id",
    "user_id",
    "artist_id",
    "title",
    "description",
    "artist_name",
    "producer",
    "producer_name",
    "producer_id",
    "producer_profile_id",
    "album_id",
    "category",
    "video_url",
    "cover_url",
    "thumbnail_url",
    "storage_path",
    "file_name",
    "file_size",
    "video_codec",
    "audio_codec",
    "mobile_compatible",
    "views",
    "likes",
    "created_at",
].join(",");

function getMissingInsertColumnsFromError(error: unknown, row: Record<string, unknown>) {
    const message = getErrorMessage(error).toLowerCase();
    const explicitMissingColumn = message.match(/'([a-z0-9_]+)' column/)?.[1] || message.match(/column ([a-z0-9_]+)/)?.[1] || "";
    return [
        ...OPTIONAL_VIDEO_INSERT_COLUMNS.filter((column) => message.includes(column.toLowerCase()) && column in row),
        ...(explicitMissingColumn && explicitMissingColumn in row ? [explicitMissingColumn] : []),
    ];
}

async function resolveOptionalVideoForeignKeys(
    supabase: ReturnType<typeof getSupabaseLibraryClient>,
    row: Record<string, unknown>,
) {
    const nextRow = { ...row };
    const producerId = typeof nextRow.producer_id === "string" ? nextRow.producer_id : null;
    if (producerId) {
        const producerLookup = await supabase.from("producer_profiles").select("id").eq("id", producerId).maybeSingle();
        if (!producerLookup.data?.id) {
            nextRow.producer_id = null;
            if (nextRow.producer_profile_id === producerId) {
                nextRow.producer_profile_id = null;
            }
        }
    }
    const producerProfileId = typeof nextRow.producer_profile_id === "string" ? nextRow.producer_profile_id : null;
    if (producerProfileId && producerProfileId !== producerId) {
        const profileLookup = await supabase.from("producer_profiles").select("id").eq("id", producerProfileId).maybeSingle();
        if (!profileLookup.data?.id) {
            nextRow.producer_profile_id = null;
        }
    }
    const albumId = typeof nextRow.album_id === "string" ? nextRow.album_id : null;
    if (albumId) {
        const albumLookup = await supabase.from("albums").select("id").eq("id", albumId).maybeSingle();
        if (!albumLookup.data?.id) {
            nextRow.album_id = null;
        }
    }
    return nextRow;
}

async function insertVideoRowWithFallback(supabase: ReturnType<typeof getSupabaseLibraryClient>, videoRow: Record<string, unknown>) {
    let nextRow = await resolveOptionalVideoForeignKeys(supabase, videoRow);
    let lastError: unknown = null;
    const minimalRow = {
        id: videoRow.id,
        user_id: videoRow.user_id,
        title: videoRow.title,
        video_url: videoRow.video_url,
        storage_path: videoRow.storage_path,
        created_at: videoRow.created_at,
    };
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const insertColumns = Object.keys(nextRow).join(",");
        const result = await supabase.from("videos").insert(nextRow).select(insertColumns || VIDEO_INSERT_SELECT_COLUMNS).single();
        if (!result.error && result.data) {
            return result;
        }
        const insertResult = result as { data?: unknown; error?: unknown };
        if (!insertResult.error && !insertResult.data && typeof nextRow.id === "string") {
            const readBack = await supabase.from("videos").select(VIDEO_INSERT_SELECT_COLUMNS).eq("id", nextRow.id).maybeSingle();
            if (!readBack.error && readBack.data) {
                return readBack;
            }
            lastError = readBack.error || "Supabase accepted the insert but returned no row.";
            return { data: null, error: lastError };
        }
        lastError = result.error || "Supabase inserted no video row.";
        console.error("[api/video-upload] videos insert attempt failed:", {
            attempt: attempt + 1,
            error: getErrorDetails(lastError),
            insertPayload: nextRow,
        });
        const missingColumns = getMissingInsertColumnsFromError(lastError, nextRow);
        if (missingColumns.length === 0) {
            if (Object.keys(nextRow).length === Object.keys(minimalRow).length) {
                return result;
            }
            nextRow = { ...minimalRow };
            continue;
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
        message: "POST JSON with mode prepare-storage-upload to get a signed Storage URL, upload the file to the Supabase Storage hostname, then POST metadata. The server verifies auth, storage, public URL, and saves the videos row.",
    });
}

export async function OPTIONS() {
    return jsonResponse({ ok: true, methods: ["POST"] });
}

export async function POST(request: Request) {
    try {
        const contentTypeHeader = request.headers.get("content-type") || "";
        if (contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
            return jsonResponse({
                error: "Do not send video file bytes to this route. Upload to Supabase Storage from the browser, then POST JSON metadata for verification and database save.",
            }, 415);
        }

        if (contentTypeHeader.toLowerCase().includes("application/json")) {
            const body = await request.json() as Record<string, unknown>;
            const requestMode = getRecordString(body, ["mode"]);
            const sessionUserId = getRecordString(body, ["sessionUserId"]);
            const userId = getRecordString(body, ["userId"]);
            const supabase = getSupabaseLibraryClient();

            if (requestMode === "prepare-storage-upload") {
                let authUserId = "";
                try {
                    authUserId = await getVerifiedUploadUserId(request, [sessionUserId, userId]);
                }
                catch (authError) {
                    return jsonResponse({ error: getErrorMessage(authError) }, 401);
                }
                const storagePath = getRecordString(body, ["storagePath", "storage_path"]);
                if (!storagePath) {
                    return jsonResponse({ error: "Video storage path is required before upload." }, 400);
                }
                const storageFolder = storagePath.split("/")[0] || "";
                if (storageFolder !== authUserId) {
                    return jsonResponse({ error: "Video storage path must stay inside the signed-in user's folder." }, 403);
                }
                console.log("STORAGE SIGNED URL AUTH", describeServerStorageAuth());
                const signedUpload = await supabase.storage.from(VIDEOS_BUCKET).createSignedUploadUrl(storagePath, {
                    upsert: false,
                });
                if (signedUpload.error || !signedUpload.data?.token) {
                    return jsonResponse({
                        error: getErrorMessage(signedUpload.error || "Supabase did not return a signed upload token."),
                        details: getErrorDetails(signedUpload.error),
                    }, 500);
                }
                return jsonResponse({
                    storagePath: signedUpload.data.path || storagePath,
                    token: signedUpload.data.token,
                    signedUrl: signedUpload.data.signedUrl || "",
                });
            }

            const providedPublicUrl = getRecordString(body, ["publicUrl", "video_url", "videoUrl"]);
            const storagePath = getRecordString(body, ["storagePath", "storage_path"]);
            const fileName = getRecordString(body, ["fileName", "file_name"], storagePath.split("/").pop() || "video.mp4");
            const fileSize = getRecordNumber(body, ["fileSize", "file_size"]);
            const cleanupOnFailure = body.cleanupOnFailure === true;
            let authUserId = "";

            try {
                authUserId = await getVerifiedUploadUserId(request, [sessionUserId, userId]);
            }
            catch (authError) {
                return jsonResponse({ error: getErrorMessage(authError) }, 401);
            }
            if (!providedPublicUrl || !storagePath) {
                return jsonResponse({ error: "Video metadata is missing the Supabase Storage URL or path." }, 400);
            }
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
            const producerId = getNullableUuid(getNullableRecordString(body, ["producer_id", "producerId"]));
            const producerProfileId = getNullableUuid(getNullableRecordString(body, ["producer_profile_id", "producerProfileId"])) || producerId;
            const albumId = getNullableUuid(getNullableRecordString(body, ["album_id", "albumId"]));
            const coverUrl = getRecordString(body, ["cover_url", "coverUrl", "cover", "thumbnail_url", "thumbnailUrl"], "/music-data-base-logo.png");
            const videoRow: Record<string, unknown> = {
                id: crypto.randomUUID(),
                user_id: authUserId,
                artist_id: getNullableUuid(getRecordString(body, ["artist_id", "artistId"], authUserId)) || authUserId,
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
                views: 0,
                likes: 0,
                created_at: createdAt,
            };
            console.error("[api/video-upload] videos insert payload:", videoRow);
            let videoInsert = await insertVideoRowWithFallback(supabase, videoRow);
            if (videoInsert.error || !videoInsert.data) {
                console.error("[api/video-upload] Supabase videos metadata insert error:", videoInsert.error);
                const cleanupError = cleanupOnFailure ? await cleanupUploadedVideoObject(supabase, storagePath) : null;
                return jsonResponse({
                    error: getErrorMessage(videoInsert.error || "Supabase inserted no video row."),
                    details: {
                        ...((getErrorDetails(videoInsert.error) || {}) as Record<string, unknown>),
                        insertPayload: videoRow,
                        insertResponse: {
                            data: videoInsert.data || null,
                            error: getErrorDetails(videoInsert.error) || null,
                        },
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
            error: "Send JSON metadata for an already uploaded Supabase Storage video object.",
        }, 415);
    }
    catch (error) {
        console.error("[api/video-upload] Server error:", error);
        return jsonResponse({ error: getErrorMessage(error), details: getErrorDetails(error) }, 500);
    }
}
