import { NextResponse } from "next/server";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { requireCreatorUploadAccess } from "@/lib/resolved-account-role";
import { requireUploadAllowedForUserId, uploadLockJsonBody } from "@/lib/upload-lock-server";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";
import { SUPABASE_PROJECT_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SONGS_BUCKET = "songs";
const DEFAULT_AUDIO_COVER = "/music-data-base-logo.png";
const REMOVED_PLACEHOLDER_IMAGES = [
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
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

function getArtworkUrl(value: string) {
    const cleanValue = value.trim();
    return cleanValue && !REMOVED_PLACEHOLDER_IMAGES.includes(cleanValue) ? cleanValue : DEFAULT_AUDIO_COVER;
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

function normalizeStoragePath(path: string) {
    return path.trim().replace(/^\/+/, "");
}

function getPublicSongUrl(supabase: ReturnType<typeof getSupabaseServerClient>, storagePath: string) {
    const normalizedPath = normalizeStoragePath(storagePath);
    const fromClient = supabase.storage.from(SONGS_BUCKET).getPublicUrl(normalizedPath).data.publicUrl;
    if (fromClient?.includes(".supabase.co/storage/")) {
        return fromClient;
    }
    const encodedPath = normalizedPath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${SUPABASE_PROJECT_URL}/storage/v1/object/public/${SONGS_BUCKET}/${encodedPath}`;
}

async function requireAudioUploadUser(request: Request, body: Record<string, unknown>) {
    const sessionUserId = getRecordString(body, ["sessionUserId", "session_user_id"]);
    const legacyUserId = getRecordString(body, ["userId", "user_id"]);
    const authUserId = sessionUserId || legacyUserId;
    if (!authUserId) {
        return { ok: false as const, status: 401, error: "You must log in again before saving song metadata." };
    }
    if (sessionUserId && legacyUserId && sessionUserId !== legacyUserId) {
        return { ok: false as const, status: 401, error: "Song metadata user id does not match the signed-in session." };
    }

    const sessionTokens = getSessionTokensFromRecord(body);
    const auth = await requireMatchingUserId(request, "/api/upload-audio", authUserId, sessionTokens);
    if (!auth.ok) {
        return { ok: false as const, status: auth.status, error: auth.error };
    }

    const uploadLock = await requireUploadAllowedForUserId(auth.userId);
    if (!uploadLock.ok) {
        return {
            ok: false as const,
            status: uploadLock.status,
            error: uploadLock.error,
            uploadLockBlocked: uploadLock.status === 503,
        };
    }

    const creatorAccess = await requireCreatorUploadAccess(auth.userId, uploadLock.email || "");
    if (!creatorAccess.ok) {
        return {
            ok: false as const,
            status: creatorAccess.status,
            error: creatorAccess.error,
        };
    }

    return { ok: true as const, authUserId: auth.userId, sessionUserId, legacyUserId };
}

function validateStorageFolder(storagePath: string, authUserId: string) {
    const normalizedPath = normalizeStoragePath(storagePath);
    const storageFolder = normalizedPath.split("/")[0] || "";
    if (!normalizedPath || storageFolder !== authUserId) {
        return {
            ok: false as const,
            error: `storagePath folder ${storageFolder || "(missing)"} must match session userId ${authUserId}.`,
        };
    }
    return { ok: true as const, storagePath: normalizedPath };
}

async function handlePrepareStorageUpload(request: Request, body: Record<string, unknown>) {
    const storagePath = getRecordString(body, ["storagePath", "storage_path"]);
    if (!storagePath) {
        return jsonResponse({ error: "storagePath is required." }, 400);
    }

    const auth = await requireAudioUploadUser(request, body);
    if (!auth.ok) {
        return jsonResponse(
            auth.uploadLockBlocked ? uploadLockJsonBody() : { error: auth.error },
            auth.status,
        );
    }

    const folderCheck = validateStorageFolder(storagePath, auth.authUserId);
    if (!folderCheck.ok) {
        return jsonResponse({ error: folderCheck.error, storagePath }, 403);
    }

    const supabase = getSupabaseServerClient();
    const signedUpload = await supabase.storage.from(SONGS_BUCKET).createSignedUploadUrl(folderCheck.storagePath, {
        upsert: false,
    });

    if (signedUpload.error || !signedUpload.data?.token) {
        console.error("[api/upload-audio] createSignedUploadUrl failed:", signedUpload.error);
        return jsonResponse({
            error: getErrorMessage(signedUpload.error || "Supabase did not return a signed upload token."),
            details: {
                bucket: SONGS_BUCKET,
                storagePath: folderCheck.storagePath,
                supabaseError: getErrorDetails(signedUpload.error),
            },
        }, 500);
    }

    const savedStoragePath = signedUpload.data.path || folderCheck.storagePath;
    return jsonResponse({
        bucket: SONGS_BUCKET,
        storagePath: savedStoragePath,
        token: signedUpload.data.token,
        signedUrl: signedUpload.data.signedUrl || "",
        publicUrl: getPublicSongUrl(supabase, savedStoragePath),
        uploadMethod: "signed",
    });
}

async function insertSongMetadata(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    songRow: Record<string, unknown>,
    authUserId: string,
    sessionUserId: string,
    legacyUserId: string,
) {
    let lastSongInsertPayload: Record<string, unknown> = songRow;
    const insertSongRow = async (row: Record<string, unknown>, selectColumns: string) => {
        lastSongInsertPayload = row;
        console.error("INSERT USER ID:", row.user_id);
        console.error("AUTH USER ID:", authUserId);
        console.error("SESSION USER ID:", sessionUserId);
        console.error("LEGACY USER ID:", legacyUserId);
        console.error("SONG USER ID MATCH:", String(row.user_id || "") === authUserId);
        console.error("FULL INSERT PAYLOAD:", row);
        return supabase
            .from("songs")
            .insert(row)
            .select(selectColumns)
            .single();
    };

    const initialInsert = await insertSongRow(songRow, "id,title,artist,producer,producer_id,beat_id,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id");
    let savedSong = initialInsert.data as Record<string, unknown> | null;
    let tableError = initialInsert.error;

    if (tableError && /producer|beat_id/i.test(getErrorMessage(tableError))) {
        const fallbackSongRow: Record<string, unknown> = { ...songRow };
        delete fallbackSongRow.producer;
        delete fallbackSongRow.producer_id;
        delete fallbackSongRow.beat_id;
        const fallbackResult = await insertSongRow(fallbackSongRow, "id,title,artist,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id");
        savedSong = fallbackResult.data as Record<string, unknown> | null;
        tableError = fallbackResult.error;
    }
    if (tableError && getErrorMessage(tableError).toLowerCase().includes("album_id")) {
        const fallbackSongRow: Record<string, unknown> = { ...songRow };
        delete fallbackSongRow.album_id;
        const fallbackResult = await insertSongRow(fallbackSongRow, "id,title,artist,producer,producer_id,beat_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id");
        savedSong = fallbackResult.data as Record<string, unknown> | null;
        tableError = fallbackResult.error;
    }
    if (tableError && getErrorMessage(tableError).toLowerCase().includes("artist")) {
        const fallbackSongRow: Record<string, unknown> = { ...songRow };
        delete fallbackSongRow.artist;
        const fallbackResult = await insertSongRow(fallbackSongRow, "id,title,description,producer,producer_id,beat_id,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id");
        savedSong = fallbackResult.data as Record<string, unknown> | null;
        tableError = fallbackResult.error;
    }
    if (tableError && getErrorMessage(tableError).toLowerCase().includes("description")) {
        const minimalSongRow: Record<string, unknown> = { ...songRow };
        delete minimalSongRow.artist;
        delete minimalSongRow.description;
        const minimalResult = await insertSongRow(minimalSongRow, "id,title,album_id,category,type,audio_url,storage_path,cover_url,avatar_url,duration,plays,likes,created_at,user_id");
        savedSong = minimalResult.data as Record<string, unknown> | null;
        tableError = minimalResult.error;
    }

    return { savedSong, tableError, lastSongInsertPayload };
}

async function handleSaveSongMetadata(request: Request, body: Record<string, unknown>) {
    const storagePath = getRecordString(body, ["storagePath", "storage_path"]);
    const publicUrl = getRecordString(body, ["publicUrl", "public_url", "audio_url"]);
    const title = getRecordString(body, ["title"]) || "Untitled song";
    const artist = getRecordString(body, ["artist"]) || "Unknown artist";
    const category = getRecordString(body, ["category"]) || "New Releases";
    const type = getRecordString(body, ["type"]) || "Beats";
    const coverUrl = getArtworkUrl(getRecordString(body, ["cover_url", "coverUrl"]));
    const producer = getRecordString(body, ["producer"]);
    const producerId = getRecordString(body, ["producer_id", "producerId"]);
    const beatId = getRecordString(body, ["beat_id", "beatId"]);
    const albumId = getRecordString(body, ["album_id", "albumId"]);

    if (!storagePath) {
        return jsonResponse({ error: "storagePath is required after the Storage upload completes." }, 400);
    }
    if (!publicUrl) {
        return jsonResponse({ error: "publicUrl is required after the Storage upload completes." }, 400);
    }

    const auth = await requireAudioUploadUser(request, body);
    if (!auth.ok) {
        return jsonResponse(
            auth.uploadLockBlocked ? uploadLockJsonBody() : { error: auth.error },
            auth.status,
        );
    }

    const folderCheck = validateStorageFolder(storagePath, auth.authUserId);
    if (!folderCheck.ok) {
        return jsonResponse({ error: folderCheck.error, storagePath }, 403);
    }

    const supabase = getSupabaseServerClient();
    const songRow = {
        id: crypto.randomUUID(),
        title,
        artist,
        description: artist,
        producer,
        producer_id: producerId || null,
        beat_id: beatId || null,
        album_id: albumId || null,
        category,
        type,
        audio_url: publicUrl,
        storage_path: folderCheck.storagePath,
        cover_url: coverUrl,
        avatar_url: coverUrl,
        duration: 180,
        plays: 0,
        likes: 0,
        created_at: new Date().toISOString(),
        user_id: auth.authUserId,
    };

    const { savedSong, tableError, lastSongInsertPayload } = await insertSongMetadata(
        supabase,
        songRow,
        auth.authUserId,
        auth.sessionUserId,
        auth.legacyUserId,
    );

    if (tableError) {
        console.error("SONG INSERT FAILED", tableError);
        console.error("[api/upload-audio] INSERT FAILED public.songs:", tableError);
        return jsonResponse({
            error: `Audio uploaded to Storage, but the songs table save failed: ${getErrorMessage(tableError)}`,
            details: {
                supabaseError: getErrorDetails(tableError),
                insertUserId: String(lastSongInsertPayload.user_id || ""),
                authUserId: auth.authUserId,
                sessionUserId: auth.sessionUserId,
                legacyUserId: auth.legacyUserId,
                userIdMatchesAuth: String(lastSongInsertPayload.user_id || "") === auth.authUserId,
                insertPayload: lastSongInsertPayload,
                publicUrl,
                storagePath: folderCheck.storagePath,
                bucket: SONGS_BUCKET,
            },
        }, 500);
    }

    return jsonResponse({
        publicUrl,
        storagePath: folderCheck.storagePath,
        song: savedSong || songRow,
    });
}

export async function POST(request: Request) {
    try {
        const contentTypeHeader = request.headers.get("content-type") || "";
        if (contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
            return jsonResponse({
                error: "Audio files must upload directly to Supabase Storage. Do not POST the file to this route.",
                details: {
                    supportedModes: ["prepare-storage-upload", "save-metadata"],
                    reason: "Vercel serverless request bodies are limited to about 4.5 MB.",
                },
            }, 413);
        }

        const rawBody = await request.text();
        let body: Record<string, unknown> = {};
        if (rawBody.trim()) {
            try {
                body = JSON.parse(rawBody) as Record<string, unknown>;
            }
            catch (parseError) {
                return jsonResponse({
                    error: "Invalid JSON body.",
                    details: { parseError: getErrorMessage(parseError) },
                }, 400);
            }
        }

        const mode = getRecordString(body, ["mode"], "save-metadata");
        if (mode === "prepare-storage-upload") {
            return handlePrepareStorageUpload(request, body);
        }
        if (mode !== "save-metadata") {
            return jsonResponse({
                error: `Unsupported mode "${mode}".`,
                details: { supportedModes: ["prepare-storage-upload", "save-metadata"] },
            }, 400);
        }

        return handleSaveSongMetadata(request, body);
    }
    catch (error) {
        console.error("[api/upload-audio] Server error:", error);
        return jsonResponse({ error: getErrorMessage(error), details: getErrorDetails(error) }, 500);
    }
}
