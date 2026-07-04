/** DESKTOP ONLY — signed/direct storage uploads with real byte progress (XHR, no auth churn). */

import type { DesktopVideoUploadTransaction } from "./desktop-video-upload-transaction";
import { fetchWithDesktopVideoUploadTransaction } from "./desktop-video-upload-transaction";
import { throwIfDesktopVideoUploadAborted } from "./desktop-video-upload-progress";

type TransferProgress = (loaded: number, total: number) => void;

type XhrUploadOptions = {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body: Blob | FormData;
    signal?: AbortSignal;
    fileSize?: number;
    onProgress?: TransferProgress;
};

function listenForAbort(signal: AbortSignal | undefined, xhr: XMLHttpRequest, onAbort: () => void) {
    if (!signal) {
        return () => undefined;
    }
    if (signal.aborted) {
        onAbort();
        return () => undefined;
    }
    const handleAbort = () => onAbort();
    signal.addEventListener("abort", handleAbort);
    return () => signal.removeEventListener("abort", handleAbort);
}

function resolveUploadTotal(event: ProgressEvent, fileSize?: number) {
    if (event.lengthComputable && event.total > 0) {
        return event.total;
    }
    return fileSize && fileSize > 0 ? fileSize : 0;
}

function xhrUploadWithProgress(options: XhrUploadOptions): Promise<{ status: number; responseText: string }> {
    throwIfDesktopVideoUploadAborted(options.signal);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(options.method, options.url, true);
        xhr.responseType = "text";

        for (const [name, value] of Object.entries(options.headers || {})) {
            xhr.setRequestHeader(name, value);
        }

        xhr.upload.onprogress = (event) => {
            if (!options.onProgress) {
                return;
            }
            const total = resolveUploadTotal(event, options.fileSize);
            options.onProgress(event.loaded, total);
        };

        const detachAbort = listenForAbort(options.signal, xhr, () => {
            xhr.abort();
            const reason = options.signal?.reason;
            reject(reason instanceof Error ? reason : new Error("Video upload was cancelled."));
        });

        xhr.onerror = () => {
            detachAbort();
            reject(new Error("Network error during video upload."));
        };

        xhr.onabort = () => {
            detachAbort();
            const reason = options.signal?.reason;
            reject(reason instanceof Error ? reason : new Error("Video upload was cancelled."));
        };

        xhr.onload = () => {
            detachAbort();
            if (options.onProgress && options.fileSize) {
                options.onProgress(options.fileSize, options.fileSize);
            }
            resolve({
                status: xhr.status,
                responseText: xhr.responseText || "",
            });
        };

        xhr.send(options.body);
    });
}

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, "");
}

function decodeSignedStoragePath(uploadUrl: URL, fallbackName: string) {
    const pathMatch = uploadUrl.pathname.match(/\/object\/upload\/sign\/videos\/(.+)$/i)
        || uploadUrl.pathname.match(/\/videos\/(.+)$/i);
    return pathMatch?.[1] ? decodeURIComponent(pathMatch[1]) : fallbackName;
}

export type SignedStorageUploadProgressResult = {
    path: string;
};

export async function uploadSignedVideoStorageWithProgress(
    signedUrl: string,
    token: string,
    file: File,
    contentType: string,
    options: {
        signal?: AbortSignal;
        fileSize?: number;
        onProgress?: TransferProgress;
    } = {},
): Promise<SignedStorageUploadProgressResult> {
    const anonKey = readBrowserSupabaseAnonKey();
    if (!anonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    }
    if (!signedUrl || !token) {
        throw new Error("Signed storage upload is missing signedUrl or token.");
    }

    const uploadUrl = new URL(signedUrl);
    uploadUrl.searchParams.set("token", token);

    const response = await xhrUploadWithProgress({
        method: "PUT",
        url: uploadUrl.toString(),
        headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            "Content-Type": contentType || file.type || "application/octet-stream",
            "x-upsert": "false",
        },
        body: file,
        signal: options.signal,
        fileSize: options.fileSize ?? file.size,
        onProgress: options.onProgress,
    });

    if (response.status < 200 || response.status >= 300) {
        throw new Error(response.responseText || `Signed storage upload failed with HTTP ${response.status}.`);
    }

    return {
        path: decodeSignedStoragePath(uploadUrl, file.name),
    };
}

export type DirectStorageUploadProgressResult = {
    publicUrl: string;
    storagePath: string;
    uploadMethod?: string;
    bucket?: string;
};

export async function uploadDirectVideoStorageWithProgress(
    transaction: DesktopVideoUploadTransaction,
    formData: FormData,
    options: {
        signal?: AbortSignal;
        fileSize?: number;
        onProgress?: TransferProgress;
    } = {},
): Promise<DirectStorageUploadProgressResult> {
    const anonKey = readBrowserSupabaseAnonKey();
    const headers: Record<string, string> = {
        Authorization: `Bearer ${transaction.accessToken}`,
    };
    if (anonKey) {
        headers.apikey = anonKey;
    }

    const response = await xhrUploadWithProgress({
        method: "POST",
        url: "/api/video-upload",
        headers,
        body: formData,
        signal: options.signal,
        fileSize: options.fileSize,
        onProgress: options.onProgress,
    });

    let result: Record<string, unknown> = {};
    try {
        result = JSON.parse(response.responseText || "{}") as Record<string, unknown>;
    }
    catch {
        result = {};
    }

    if (response.status < 200 || response.status >= 300) {
        const errorMessage = typeof result.error === "string" && result.error.trim()
            ? result.error.trim()
            : `Direct storage upload failed with HTTP ${response.status}.`;
        const details = result.details ? ` ${JSON.stringify(result.details)}` : "";
        throw new Error(`${errorMessage}${details}`);
    }

    const publicUrl = typeof result.publicUrl === "string" ? result.publicUrl.trim() : "";
    const storagePath = typeof result.storagePath === "string" ? result.storagePath.trim() : "";
    if (!publicUrl || !storagePath) {
        throw new Error("Direct storage upload did not return a public URL.");
    }

    return {
        publicUrl,
        storagePath,
        uploadMethod: typeof result.uploadMethod === "string" ? result.uploadMethod : "direct",
        bucket: typeof result.bucket === "string" ? result.bucket : undefined,
    };
}

export async function prepareDesktopVideoStorageUpload(
    transaction: DesktopVideoUploadTransaction,
    payload: {
        sessionUserId: string;
        userId: string;
        storagePath: string;
    },
    signal?: AbortSignal,
) {
    const response = await fetchWithDesktopVideoUploadTransaction(transaction, "/api/video-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            mode: "prepare-storage-upload",
            sessionUserId: payload.sessionUserId,
            userId: payload.userId,
            storagePath: payload.storagePath,
        }),
        signal,
    });

    const result = (await response.json().catch(() => ({}))) as {
        storagePath?: string;
        token?: string;
        signedUrl?: string;
        publicUrl?: string;
        error?: string;
        details?: unknown;
        useDirectUpload?: boolean;
        uploadMethod?: string;
        authUserId?: string;
        bucket?: string;
    };

    return {
        ok: response.ok,
        status: response.status,
        result,
    };
}
