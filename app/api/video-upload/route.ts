import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { describeRouteAuth, getBearerToken } from "@/lib/request-auth";
import { getErrorMessage as sharedGetErrorMessage, getSupabaseLibraryClient, getSupabaseServerClient } from "@/lib/server-supabase";
import { readSupabaseLibraryApiKey, SUPABASE_PROJECT_URL } from "@/lib/supabase-config";

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

function decodeJwtPayload(key: string) {
    try {
        const payload = key.split(".")[1];
        if (!payload)
            return null;
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as { iss?: string; ref?: string; role?: string };
    }
    catch {
        return null;
    }
}

function describeServiceRoleEnv() {
    const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^["']|["']$/g, "");
    const placeholder = !raw || raw === "your_service_role_key_here";
    const shape = placeholder ? "missing" : raw.startsWith("eyJ") ? "legacy-jwt" : raw.startsWith("sb_secret_") ? "sb_secret" : "other";
    const jwtPayload = raw.startsWith("eyJ") ? decodeJwtPayload(raw) : null;
    return {
        configured: !placeholder,
        keyShape: shape,
        keyLength: raw.length,
        role: jwtPayload?.role || null,
        projectRef: jwtPayload?.ref || null,
        libraryKeySource: describeLibraryKeySource(),
    };
}

function describeLibraryKeySource() {
    try {
        const apiKey = readSupabaseLibraryApiKey();
        const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^["']|["']$/g, "");
        if (serviceRoleKey && apiKey === serviceRoleKey)
            return "SUPABASE_SERVICE_ROLE_KEY";
        return "NEXT_PUBLIC_SUPABASE_ANON_KEY (fallback)";
    }
    catch (error) {
        return `unavailable: ${getErrorMessage(error)}`;
    }
}

function getSupabaseAuthClient() {
    const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    return createClient(SUPABASE_PROJECT_URL, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

function getStorageSupabaseClient() {
    const serviceRoleEnv = describeServiceRoleEnv();
    try {
        return {
            client: getSupabaseServerClient(),
            keySource: "SUPABASE_SERVICE_ROLE_KEY",
            serviceRoleEnv,
        };
    }
    catch (serviceRoleError) {
        console.warn("[api/video-upload] Service role client unavailable, using library client:", getErrorMessage(serviceRoleError));
        return {
            client: getSupabaseLibraryClient(),
            keySource: describeLibraryKeySource(),
            serviceRoleEnv,
            serviceRoleError: getErrorMessage(serviceRoleError),
        };
    }
}

type AuthSuccess = {
    ok: true;
    userId: string;
    email: string | undefined;
    session: {
        hasBearerToken: boolean;
        bearerTokenLength: number;
        claimedUserId: string;
    };
};

type AuthFailure = {
    ok: false;
    status: number;
    error: string;
    details: Record<string, unknown>;
};

async function resolveAuthenticatedUploadUser(request: Request, claimedUserIds: string[]): Promise<AuthSuccess | AuthFailure> {
    const claimedUserId = claimedUserIds.find((id) => id?.trim())?.trim() || "";
    const routeAuth = describeRouteAuth(request, "/api/video-upload", claimedUserId);
    const token = getBearerToken(request);
    const serviceRoleEnv = describeServiceRoleEnv();

    console.log("[api/video-upload] SESSION STATUS", {
        ...routeAuth,
        serviceRoleEnv,
        supabaseUrl: SUPABASE_PROJECT_URL,
    });

    if (!token) {
        return {
            ok: false,
            status: 401,
            error: "Missing Authorization header. Send Authorization: Bearer <session.access_token> from the logged-in Supabase session.",
            details: { ...routeAuth, serviceRoleEnv, step: "bearer-token-missing" },
        };
    }

    const authClient = getSupabaseAuthClient();
    const { data, error } = await authClient.auth.getUser(token);

    console.log("[api/video-upload] AUTHENTICATED USER", {
        authError: error?.message || null,
        userId: data.user?.id || null,
        email: data.user?.email || null,
        bearerTokenLength: token.length,
    });

    if (error || !data.user?.id) {
        return {
            ok: false,
            status: 401,
            error: `Session verification failed: ${error?.message || "Supabase auth.getUser returned no user."}`,
            details: {
                ...routeAuth,
                serviceRoleEnv,
                supabaseAuthError: getErrorDetails(error),
                step: "auth-get-user-failed",
            },
        };
    }

    const authUserId = data.user.id;
    if (claimedUserId && claimedUserId !== authUserId) {
        return {
            ok: false,
            status: 403,
            error: "Request user id does not match the authenticated session user.",
            details: {
                claimedUserId,
                authUserId,
                email: data.user.email || null,
                step: "user-id-mismatch",
            },
        };
    }

    return {
        ok: true,
        userId: authUserId,
        email: data.user.email,
        session: {
            hasBearerToken: true,
            bearerTokenLength: token.length,
            claimedUserId: claimedUserId || authUserId,
        },
    };
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

function getVideoContentType(file: File, fallback = "video/mp4") {
    const browserType = file.type.trim().toLowerCase();
    if (browserType && browserType.startsWith("video/")) {
        return browserType;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "mp4";
    if (extension === "mov")
        return "video/quicktime";
    if (extension === "webm")
        return "video/webm";
    if (extension === "m4v")
        return "video/x-m4v";
    return fallback;
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
    if (!storagePath)
        return null;
    const { error } = await supabase.storage.from(VIDEOS_BUCKET).remove([storagePath]);
    return error ? getErrorMessage(error) : null;
}

function getServiceRoleKeyFormat() {
    const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^["']|["']$/g, "");
    return {
        startsWithEyJ: raw.startsWith("eyJ"),
        startsWithSbSecret: raw.startsWith("sb_secret_"),
    };
}

function prepareStorageUploadResponse(body: Record<string, unknown>, status: 200 | 401 | 400 | 500) {
    return NextResponse.json({ mode: "prepare-storage-upload", ...body }, { status });
}

function buildPrepareDebug(request: Request, storagePath: string) {
    const authorization = request.headers.get("authorization") || "";
    return {
        hasAuthorization: Boolean(authorization),
        authHeaderPrefix: authorization.slice(0, 24),
        hasStoragePath: Boolean(storagePath),
        bucketName: VIDEOS_BUCKET,
        serviceRoleKeyFormat: getServiceRoleKeyFormat(),
        signedUploadError: "",
    };
}

async function handlePrepareStorageUpload(request: Request, body: Record<string, unknown>) {
    const storagePath = getRecordString(body, ["storagePath", "storage_path"]);
    const debug = buildPrepareDebug(request, storagePath);

    console.log("[api/video-upload] PREPARE STORAGE UPLOAD", debug);

    if (!debug.hasStoragePath) {
        const error = "Video storage path is required before upload.";
        console.log("[api/video-upload] PREPARE FAILED", { ...debug, error });
        return prepareStorageUploadResponse({ error, ...debug }, 400);
    }

    const token = getBearerToken(request);
    if (!token) {
        const error = "Missing Authorization bearer token. Log in again and retry.";
        console.log("[api/video-upload] PREPARE FAILED", { ...debug, error });
        return prepareStorageUploadResponse({ error, ...debug }, 401);
    }

    const authClient = getSupabaseAuthClient();
    const { data: authData, error: authError } = await authClient.auth.getUser(token);

    console.log("[api/video-upload] PREPARE AUTH USER", {
        ...debug,
        authUserId: authData.user?.id || null,
        authEmail: authData.user?.email || null,
        authError: authError?.message || null,
    });

    if (authError || !authData.user?.id) {
        const error = authError?.message || "Session verification failed.";
        console.log("[api/video-upload] PREPARE FAILED", { ...debug, error });
        return prepareStorageUploadResponse({
            error,
            authError: getErrorDetails(authError),
            ...debug,
        }, 401);
    }

    const authUserId = authData.user.id;
    const claimedUserId = getRecordString(body, ["sessionUserId", "session_user_id", "userId", "user_id"]);
    if (claimedUserId && claimedUserId !== authUserId) {
        const error = "Request user id does not match the authenticated session.";
        console.log("[api/video-upload] PREPARE FAILED", { ...debug, error, authUserId, claimedUserId });
        return prepareStorageUploadResponse({
            error,
            authUserId,
            claimedUserId,
            ...debug,
        }, 401);
    }

    const storageFolder = storagePath.split("/")[0] || "";
    if (storageFolder !== authUserId) {
        const error = "Video storage path must stay inside the signed-in user's folder.";
        console.log("[api/video-upload] PREPARE FAILED", { ...debug, error, authUserId, storagePath });
        return prepareStorageUploadResponse({
            error,
            authUserId,
            storagePath,
            ...debug,
        }, 400);
    }

    const { client: storageClient, keySource } = getStorageSupabaseClient();
    console.log("[api/video-upload] PREPARE CREATE SIGNED URL", {
        ...debug,
        authUserId,
        storagePath,
        keySource,
    });

    const signedUpload = await storageClient.storage.from(VIDEOS_BUCKET).createSignedUploadUrl(storagePath, {
        upsert: false,
    });

    const signedUploadError = signedUpload.error
        ? getErrorMessage(signedUpload.error)
        : !signedUpload.data?.token
            ? "Supabase did not return a signed upload token."
            : "";

    console.log("[api/video-upload] PREPARE SIGNED URL RESPONSE", {
        ...debug,
        authUserId,
        storagePath,
        signedUrl: signedUpload.data?.signedUrl || "",
        hasToken: Boolean(signedUpload.data?.token),
        signedUploadError,
        supabaseError: signedUpload.error ? getErrorDetails(signedUpload.error) : null,
    });

    if (signedUploadError) {
        return prepareStorageUploadResponse({
            ...debug,
            error: signedUploadError,
            signedUploadError,
            authUserId,
            storagePath,
            supabaseError: getErrorDetails(signedUpload.error),
            keySource,
        }, 500);
    }

    return prepareStorageUploadResponse({
        ...debug,
        storagePath: signedUpload.data!.path || storagePath,
        token: signedUpload.data!.token,
        signedUrl: signedUpload.data!.signedUrl || "",
        authUserId,
        signedUploadError: "",
        keySource,
    }, 200);
}

async function createSignedUploadUrlForUser(storagePath: string, authUserId: string) {
    const storageFolder = storagePath.split("/")[0] || "";
    if (storageFolder !== authUserId) {
        return {
            ok: false as const,
            status: 403,
            error: "Video storage path must stay inside the signed-in user's folder.",
            details: { storagePath, authUserId, bucket: VIDEOS_BUCKET },
        };
    }

    const { client: storageClient, keySource, serviceRoleEnv, serviceRoleError } = getStorageSupabaseClient();

    console.log("[api/video-upload] SIGNED URL REQUEST", {
        bucket: VIDEOS_BUCKET,
        storagePath,
        authUserId,
        keySource,
        serviceRoleEnv,
        serviceRoleError: serviceRoleError || null,
    });

    const signedUpload = await storageClient.storage.from(VIDEOS_BUCKET).createSignedUploadUrl(storagePath, {
        upsert: false,
    });

    console.log("[api/video-upload] SIGNED URL RESPONSE", {
        bucket: VIDEOS_BUCKET,
        storagePath,
        hasToken: Boolean(signedUpload.data?.token),
        signedUrl: signedUpload.data?.signedUrl || "",
        supabaseError: signedUpload.error ? getErrorDetails(signedUpload.error) : null,
    });

    if (signedUpload.error || !signedUpload.data?.token) {
        return {
            ok: false as const,
            status: 500,
            error: getErrorMessage(signedUpload.error || "Supabase did not return a signed upload token."),
            details: {
                bucket: VIDEOS_BUCKET,
                storagePath,
                authUserId,
                keySource,
                serviceRoleEnv,
                supabaseError: getErrorDetails(signedUpload.error),
                useDirectUpload: true,
            },
        };
    }

    return {
        ok: true as const,
        storagePath: signedUpload.data.path || storagePath,
        token: signedUpload.data.token,
        signedUrl: signedUpload.data.signedUrl || "",
        keySource,
        serviceRoleEnv,
    };
}

async function directStorageUpload(request: Request, file: File, storagePath: string, contentType: string, authUserId: string) {
    const storageFolder = storagePath.split("/")[0] || "";
    if (storageFolder !== authUserId) {
        return jsonResponse({
            error: "Video storage path must stay inside the signed-in user's folder.",
            details: { storagePath, authUserId, bucket: VIDEOS_BUCKET },
        }, 403);
    }

    const { client: storageClient, keySource, serviceRoleEnv, serviceRoleError } = getStorageSupabaseClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    console.log("[api/video-upload] DIRECT STORAGE UPLOAD", {
        bucket: VIDEOS_BUCKET,
        storagePath,
        authUserId,
        fileSize: file.size,
        contentType,
        keySource,
        serviceRoleEnv,
        serviceRoleError: serviceRoleError || null,
    });

    const uploadResult = await storageClient.storage.from(VIDEOS_BUCKET).upload(storagePath, buffer, {
        cacheControl: "3600",
        contentType,
        upsert: false,
    });

    console.log("[api/video-upload] DIRECT STORAGE UPLOAD RESPONSE", {
        bucket: VIDEOS_BUCKET,
        storagePath,
        uploadData: uploadResult.data,
        supabaseError: uploadResult.error ? getErrorDetails(uploadResult.error) : null,
    });

    if (uploadResult.error) {
        return jsonResponse({
            error: `Direct storage upload failed: ${getErrorMessage(uploadResult.error)}`,
            details: {
                bucket: VIDEOS_BUCKET,
                storagePath,
                authUserId,
                keySource,
                serviceRoleEnv,
                supabaseError: getErrorDetails(uploadResult.error),
            },
            uploadMethod: "direct",
        }, 500);
    }

    const publicUrl = getPublicVideoUrl(storageClient, storagePath);
    if (!publicUrl) {
        return jsonResponse({
            error: "Direct storage upload succeeded but Supabase did not return a public URL.",
            details: { bucket: VIDEOS_BUCKET, storagePath },
            uploadMethod: "direct",
        }, 500);
    }

    return jsonResponse({
        ok: true,
        uploadMethod: "direct",
        storagePath: uploadResult.data?.path || storagePath,
        publicUrl,
        bucket: VIDEOS_BUCKET,
        fileName: file.name,
        fileSize: file.size,
        contentType,
        keySource,
        serviceRoleEnv,
    });
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

async function saveVideoMetadata(request: Request, body: Record<string, unknown>, authUserId: string) {
    const supabase = getSupabaseLibraryClient();
    const providedPublicUrl = getRecordString(body, ["publicUrl", "video_url", "videoUrl"]);
    const storagePath = getRecordString(body, ["storagePath", "storage_path"]);
    const fileName = getRecordString(body, ["fileName", "file_name"], storagePath.split("/").pop() || "video.mp4");
    const fileSize = getRecordNumber(body, ["fileSize", "file_size"]);
    const cleanupOnFailure = body.cleanupOnFailure === true;

    if (!providedPublicUrl || !storagePath) {
        return jsonResponse({
            error: "Video metadata is missing the Supabase Storage URL or path.",
            details: { providedPublicUrl, storagePath, authUserId },
        }, 400);
    }

    const publicUrl = getPublicVideoUrl(supabase, storagePath);
    if (!publicUrl) {
        return jsonResponse({
            error: "Supabase did not return a public URL for the uploaded video.",
            details: { bucket: VIDEOS_BUCKET, storagePath, authUserId },
        }, 500);
    }
    if (providedPublicUrl !== publicUrl) {
        return jsonResponse({
            error: "Video metadata public URL does not match the uploaded storage path.",
            details: { providedPublicUrl, generatedPublicUrl: publicUrl, storagePath, authUserId },
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
                authUserId,
                bucket: VIDEOS_BUCKET,
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

    console.log("[api/video-upload] VIDEO METADATA INSERT", {
        authUserId,
        bucket: VIDEOS_BUCKET,
        storagePath,
        publicUrl,
        videoRow,
    });

    const videoInsert = await insertVideoRowWithFallback(supabase, videoRow);
    if (videoInsert.error || !videoInsert.data) {
        const cleanupError = cleanupOnFailure ? await cleanupUploadedVideoObject(supabase, storagePath) : null;
        return jsonResponse({
            error: getErrorMessage(videoInsert.error || "Supabase inserted no video row."),
            details: {
                ...((getErrorDetails(videoInsert.error) || {}) as Record<string, unknown>),
                insertPayload: videoRow,
                authUserId,
                bucket: VIDEOS_BUCKET,
                storagePath,
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
                authUserId,
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

export async function GET() {
    return jsonResponse({
        ok: true,
        route: "/api/video-upload",
        bucket: VIDEOS_BUCKET,
        serviceRoleEnv: describeServiceRoleEnv(),
        message: "POST JSON prepare-storage-upload, POST multipart direct-storage-upload fallback, then POST metadata JSON.",
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
            const mode = String(formData.get("mode") || "direct-storage-upload").trim();
            const sessionUserId = String(formData.get("sessionUserId") || "").trim();
            const userId = String(formData.get("userId") || "").trim();
            const storagePath = String(formData.get("storagePath") || formData.get("storage_path") || "").trim();
            const file = getFormFile(formData.get("file"));
            const contentType = String(formData.get("contentType") || formData.get("content_type") || "").trim();

            const auth = await resolveAuthenticatedUploadUser(request, [sessionUserId, userId]);
            if (!auth.ok) {
                return jsonResponse({ error: auth.error, details: auth.details, uploadMethod: mode }, auth.status);
            }

            if (mode !== "direct-storage-upload") {
                return jsonResponse({
                    error: `Unsupported multipart mode "${mode}". Use mode=direct-storage-upload.`,
                    details: { supportedModes: ["direct-storage-upload"] },
                }, 400);
            }
            if (!file) {
                return jsonResponse({ error: "Choose a video file for direct storage upload.", details: { mode } }, 400);
            }
            if (!storagePath) {
                return jsonResponse({ error: "storagePath is required for direct storage upload.", details: { authUserId: auth.userId } }, 400);
            }

            return directStorageUpload(
                request,
                file,
                storagePath,
                contentType || getVideoContentType(file),
                auth.userId,
            );
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

        const requestMode = getRecordString(body, ["mode"]);
        if (requestMode === "prepare-storage-upload") {
            return handlePrepareStorageUpload(request, body);
        }

        if (!contentTypeHeader.toLowerCase().includes("application/json")) {
            return jsonResponse({
                error: "Send application/json or multipart/form-data to /api/video-upload.",
                details: { contentType: contentTypeHeader || "missing" },
            }, 415);
        }

        const sessionUserId = getRecordString(body, ["sessionUserId", "session_user_id"]);
        const userId = getRecordString(body, ["userId", "user_id"]);

        const auth = await resolveAuthenticatedUploadUser(request, [sessionUserId, userId]);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error, details: auth.details }, auth.status);
        }

        return saveVideoMetadata(request, body, auth.userId);
    }
    catch (error) {
        console.error("[api/video-upload] Server error:", error);
        return jsonResponse({
            error: sharedGetErrorMessage(error),
            details: getErrorDetails(error),
            serviceRoleEnv: describeServiceRoleEnv(),
        }, 500);
    }
}
