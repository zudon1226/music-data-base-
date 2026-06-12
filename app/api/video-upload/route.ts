import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
        if (contentTypeHeader.toLowerCase().includes("application/json")) {
            const body = await request.json() as Record<string, unknown>;
            const sessionUserId = getRecordString(body, ["sessionUserId"]);
            const userId = getRecordString(body, ["userId"]);
            const authUserId = sessionUserId || userId;
            const publicUrl = getRecordString(body, ["publicUrl", "video_url", "videoUrl"]);
            const storagePath = getRecordString(body, ["storagePath", "storage_path"]);
            const fileName = getRecordString(body, ["fileName", "file_name"], storagePath.split("/").pop() || "video.mp4");
            const fileSize = getRecordNumber(body, ["fileSize", "file_size"]);
            const videoCodec = getNullableRecordString(body, ["video_codec", "videoCodec"]);
            const audioCodec = getNullableRecordString(body, ["audio_codec", "audioCodec"]);
            const rawMobileCompatible = body.mobile_compatible ?? body.mobileCompatible;
            const mobileCompatible = typeof rawMobileCompatible === "boolean" ? rawMobileCompatible : null;

            if (!authUserId) {
                return jsonResponse({ error: "You must log in again before uploading a video." }, 401);
            }
            if (sessionUserId && userId && sessionUserId !== userId) {
                return jsonResponse({ error: "Video upload user id does not match the signed-in session." }, 401);
            }
            if (!publicUrl || !storagePath) {
                return jsonResponse({ error: "Video metadata is missing the Supabase Storage URL or path." }, 400);
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
                "video_codec",
                "audio_codec",
                "mobile_compatible",
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
                video_codec: videoRow.video_codec,
                audio_codec: videoRow.audio_codec,
                mobile_compatible: videoRow.mobile_compatible,
                created_at: videoRow.created_at,
            };
            const fallbackSelectColumns = [
                "id",
                "title",
                "artist_name",
                "producer_id",
                "video_url",
                "storage_path",
                "video_codec",
                "audio_codec",
                "mobile_compatible",
                "created_at",
                "user_id",
            ].join(",");
            const supabase = getSupabaseServerClient();
            let videoInsert = await supabase.from("videos").insert(videoRow).select(initialSelectColumns).single();
            if (videoInsert.error && /video_codec|audio_codec|mobile_compatible|file_name|file_size|album_id|artist_id|producer|cover_url|thumbnail_url/i.test(getErrorMessage(videoInsert.error))) {
                videoInsert = await supabase.from("videos").insert(fallbackVideoRow).select(fallbackSelectColumns).single();
            }
            if (videoInsert.error && /video_codec|audio_codec|mobile_compatible/i.test(getErrorMessage(videoInsert.error))) {
                const legacyVideoRow = { ...fallbackVideoRow };
                delete legacyVideoRow.video_codec;
                delete legacyVideoRow.audio_codec;
                delete legacyVideoRow.mobile_compatible;
                videoInsert = await supabase.from("videos").insert(legacyVideoRow).select("id,title,artist_name,producer_id,video_url,storage_path,created_at,user_id").single();
            }
            if (videoInsert.error) {
                console.error("[api/video-upload] Supabase videos metadata insert error:", videoInsert.error);
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
                publicUrl,
                storagePath,
                fileName,
                fileSize,
                contentType: getRecordString(body, ["contentType", "content_type"]),
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
