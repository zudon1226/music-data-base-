import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEOS_BUCKET = "videos";

type VideoUploadSignBody = {
    fileName?: unknown;
    contentType?: unknown;
    userId?: unknown;
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

function getStringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
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
    });
}

export async function OPTIONS() {
    return jsonResponse({ ok: true, methods: ["POST"] });
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as VideoUploadSignBody;
        const fileName = getStringValue(body.fileName);
        const userId = getStringValue(body.userId);
        const contentType = normalizeVideoContentType(getStringValue(body.contentType), fileName || "video.mp4");

        if (!fileName) {
            return jsonResponse({ error: "Video file name is required." }, 400);
        }
        if (!userId) {
            return jsonResponse({ error: "You must log in again before uploading a video." }, 401);
        }
        if (!contentType.startsWith("video/")) {
            return jsonResponse({ error: "Only video files can be uploaded.", details: { contentType } }, 400);
        }

        const cleanFileName = cleanStorageFileName(fileName);
        const storagePath = `${userId}/${Date.now()}-${crypto.randomUUID()}-${cleanFileName}`;
        const supabase = getSupabaseServerClient();
        const { data: signedData, error: signedError } = await supabase.storage
            .from(VIDEOS_BUCKET)
            .createSignedUploadUrl(storagePath, { upsert: true });

        if (signedError || !signedData?.signedUrl || !signedData?.token) {
            console.error("[api/video-upload] Signed upload URL error:", signedError);
            return jsonResponse({
                error: getErrorMessage(signedError || "Supabase did not return a signed upload URL."),
                details: getErrorDetails(signedError),
            }, 500);
        }

        const { data: publicUrlData } = supabase.storage.from(VIDEOS_BUCKET).getPublicUrl(storagePath);
        return jsonResponse({
            signedUploadUrl: signedData.signedUrl,
            uploadToken: signedData.token,
            storagePath,
            publicUrl: publicUrlData.publicUrl,
            fileName,
            contentType,
        });
    }
    catch (error) {
        console.error("[api/video-upload] Server error:", error);
        return jsonResponse({ error: getErrorMessage(error), details: getErrorDetails(error) }, 500);
    }
}
