import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
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
const ACCEPTED_AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/aac"]);
const AUDIO_CONTENT_TYPES_BY_EXTENSION: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
};

function cleanStorageFileName(fileName: string) {
    const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
    const baseName = fileName
        .replace(/\.[^/.]+$/, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80);
    return `${baseName || "song"}.${extension || "mp3"}`;
}

function getAudioContentType(file: File) {
    const browserType = file.type.trim().toLowerCase();
    if (browserType && ACCEPTED_AUDIO_TYPES.has(browserType)) {
        return browserType;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    return AUDIO_CONTENT_TYPES_BY_EXTENSION[extension] || "audio/mpeg";
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
    return cleanValue && !REMOVED_PLACEHOLDER_IMAGES.includes(cleanValue) ? cleanValue : DEFAULT_AUDIO_COVER;
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

function getPublicSongUrl(supabase: ReturnType<typeof getSupabaseServerClient>, storagePath: string) {
    const normalizedPath = storagePath.replace(/^\/+/, "");
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

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = getFormFile(formData.get("file"));
        const sessionUserId = String(formData.get("sessionUserId") || "").trim();
        const legacyUserId = String(formData.get("userId") || "").trim();
        const authUserId = sessionUserId;
        const title = String(formData.get("title") || "").trim() || "Untitled song";
        const artist = String(formData.get("artist") || "").trim() || "Unknown artist";
        const category = String(formData.get("category") || "").trim() || "New Releases";
        const type = String(formData.get("type") || "").trim() || "Beats";
        const coverUrl = getArtworkUrl(String(formData.get("cover_url") || ""));
        const producer = String(formData.get("producer") || "").trim();
        const producerId = String(formData.get("producer_id") || "").trim();
        const beatId = String(formData.get("beat_id") || "").trim();
        const albumId = String(formData.get("album_id") || "").trim();
        if (!file) {
            return jsonResponse({ error: "Choose an MP3, WAV, or M4A audio file." }, 400);
        }
        if (!authUserId) {
            return jsonResponse({ error: "You must log in again before saving song metadata." }, 401);
        }
        const uploadLock = await requireUploadAllowedForUserId(authUserId);
        if (!uploadLock.ok) {
            return jsonResponse(uploadLock.status === 503 ? uploadLockJsonBody() : { error: uploadLock.error }, uploadLock.status);
        }
        if (legacyUserId && legacyUserId !== authUserId) {
            console.error("SONG USER ID MISMATCH", {
                sessionUserId: authUserId,
                userId: legacyUserId,
            });
            return jsonResponse({ error: "Song metadata user id does not match the signed-in session." }, 401);
        }
        const contentType = getAudioContentType(file);
        if (!contentType.startsWith("audio/")) {
            return jsonResponse({ error: "Only MP3, WAV, and M4A audio files can be uploaded.", details: { contentType } }, 400);
        }
        const cleanFileName = cleanStorageFileName(file.name || "song.mp3");
        const filePath = `${authUserId}/${crypto.randomUUID()}-${cleanFileName}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        const supabase = getSupabaseServerClient();

        const uploadResult = await supabase.storage.from(SONGS_BUCKET).upload(filePath, buffer, {
            cacheControl: "3600",
            contentType,
            upsert: false,
        });
        if (uploadResult.error) {
            console.error("[api/upload-audio] Supabase upload error:", uploadResult.error);
            return jsonResponse({
                error: getErrorMessage(uploadResult.error),
                details: {
                    bucket: SONGS_BUCKET,
                    storagePath: filePath,
                    supabaseUrl: SUPABASE_PROJECT_URL,
                    supabaseError: getErrorDetails(uploadResult.error),
                },
            }, 500);
        }

        const savedStoragePath = uploadResult.data?.path || filePath;
        const publicUrl = getPublicSongUrl(supabase, savedStoragePath);
        if (!publicUrl) {
            await supabase.storage.from(SONGS_BUCKET).remove([savedStoragePath]);
            return jsonResponse({ error: "Supabase did not return a public URL for the uploaded audio." }, 500);
        }

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
            storage_path: savedStoragePath,
            cover_url: coverUrl,
            avatar_url: coverUrl,
            duration: 180,
            plays: 0,
            likes: 0,
            created_at: new Date().toISOString(),
            user_id: authUserId,
        };
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
        if (tableError) {
            console.error("INSERT USER ID:", lastSongInsertPayload.user_id);
            console.error("AUTH USER ID:", authUserId);
            console.error("SESSION USER ID:", sessionUserId);
            console.error("LEGACY USER ID:", legacyUserId);
            console.error("SONG USER ID MATCH:", String(lastSongInsertPayload.user_id || "") === authUserId);
            console.error("FULL INSERT PAYLOAD:", lastSongInsertPayload);
            console.error("SONG INSERT FAILED", tableError);
            console.error("[api/upload-audio] INSERT FAILED public.songs:", tableError);
            await supabase.storage.from(SONGS_BUCKET).remove([savedStoragePath]);
            return jsonResponse({
                error: `Audio uploaded to Storage, but the songs table save failed: ${getErrorMessage(tableError)}`,
                details: {
                    supabaseError: getErrorDetails(tableError),
                    insertUserId: String(lastSongInsertPayload.user_id || ""),
                    authUserId,
                    sessionUserId,
                    legacyUserId,
                    userIdMatchesAuth: String(lastSongInsertPayload.user_id || "") === authUserId,
                    insertPayload: lastSongInsertPayload,
                    publicUrl,
                    storagePath: savedStoragePath,
                    bucket: SONGS_BUCKET,
                },
            }, 500);
        }
        return jsonResponse({
            publicUrl,
            storagePath: savedStoragePath,
            song: savedSong || songRow,
        });
    }
    catch (error) {
        console.error("[api/upload-audio] Server error:", error);
        return jsonResponse({ error: getErrorMessage(error), details: getErrorDetails(error) }, 500);
    }
}
