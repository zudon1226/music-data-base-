import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { requireUploadAllowedForUserId, uploadLockJsonBody } from "@/lib/upload-lock-server";
import { NextResponse } from "next/server";
import { inspectVideoBytesForUploadCompatibility, VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE } from "@/lib/video-upload-compatibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEOS_BUCKET = "videos";

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

export async function GET() {
    return jsonResponse({
        ok: true,
        route: "/api/upload-video",
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
        const uploadLock = await requireUploadAllowedForUserId(authUserId);
        if (!uploadLock.ok) {
            return jsonResponse(uploadLock.status === 503 ? uploadLockJsonBody() : { error: uploadLock.error }, uploadLock.status);
        }
        if (sessionUserId && userId && sessionUserId !== userId) {
            return jsonResponse({ error: "Video upload user id does not match the signed-in session." }, 401);
        }

        const contentType = getVideoContentType(file);
        if (!contentType.startsWith("video/")) {
            return jsonResponse({ error: "Only video files can be uploaded.", details: { contentType } }, 400);
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const sampleSize = Math.min(256 * 1024, buffer.byteLength);
        const sampleParts: Uint8Array[] = [new Uint8Array(buffer.subarray(0, sampleSize))];
        if (buffer.byteLength > sampleSize) {
            sampleParts.push(new Uint8Array(buffer.subarray(Math.max(0, buffer.byteLength - sampleSize))));
        }
        const merged = new Uint8Array(sampleParts.reduce((sum, part) => sum + part.byteLength, 0));
        let offset = 0;
        for (const part of sampleParts) {
            merged.set(part, offset);
            offset += part.byteLength;
        }
        const inspection = inspectVideoBytesForUploadCompatibility(merged, {
            mimeType: contentType,
            fileName: file.name,
        });
        if (!inspection.canPublish) {
            return jsonResponse({
                error: VIDEO_UPLOAD_INCOMPATIBLE_USER_MESSAGE,
                details: {
                    compatibilityStatus: inspection.compatibilityStatus,
                    compatibilityReason: inspection.compatibilityReason,
                    videoCodec: inspection.videoCodec,
                    audioCodec: inspection.audioCodec,
                },
            }, 400);
        }

        const cleanFileName = cleanStorageFileName(file.name || "video.mp4");
        const storagePath = `${authUserId}/${Date.now()}-${crypto.randomUUID()}-${cleanFileName}`;
        const supabase = getSupabaseServerClient();

        const { error: uploadError } = await supabase.storage.from(VIDEOS_BUCKET).upload(storagePath, buffer, {
            cacheControl: "3600",
            contentType: "video/mp4",
            upsert: true,
        });
        if (uploadError) {
            console.error("[api/upload-video] Supabase Storage upload error:", uploadError);
            return jsonResponse({ error: getErrorMessage(uploadError), details: getErrorDetails(uploadError) }, 500);
        }

        const { data } = supabase.storage.from(VIDEOS_BUCKET).getPublicUrl(storagePath);
        if (!data.publicUrl) {
            return jsonResponse({ error: "Supabase did not return a public URL for the uploaded video." }, 500);
        }

        return jsonResponse({
            publicUrl: data.publicUrl,
            storagePath,
            fileName: file.name || cleanFileName,
            fileSize: file.size,
            contentType: "video/mp4",
            compatibility: {
                video_codec: "h264",
                audio_codec: "aac",
                mobile_compatible: true,
                compatibility_status: "compatible",
            },
        });
    }
    catch (error) {
        console.error("[api/upload-video] Server error:", error);
        return jsonResponse({ error: getErrorMessage(error), details: getErrorDetails(error) }, 500);
    }
}
