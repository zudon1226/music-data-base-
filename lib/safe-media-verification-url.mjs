/**
 * SSRF guardrails for server-side media verification (no arbitrary outbound fetch).
 */

const PRIVATE_IPV4_BLOCKS = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
];

export function isPrivateOrLocalHostname(hostname) {
    const host = String(hostname || "").trim().toLowerCase();
    if (!host) return true;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
    if (host === "::1" || host === "[::1]") return true;
    if (host.includes(":")) return true;
    return PRIVATE_IPV4_BLOCKS.some((re) => re.test(host));
}

/** Returns true when URL must never be used for outbound verification fetch. */
export function isBlockedOutboundMediaProbeUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return true;
    if (trimmed.startsWith("/")) return true;
    if (trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return true;
    let parsed;
    try {
        parsed = new URL(trimmed);
    }
    catch {
        return true;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
    if (isPrivateOrLocalHostname(parsed.hostname)) return true;
    return false;
}

export function inferVideoContentTypeFromPath(storagePath) {
    const ext = String(storagePath || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "webm") return "video/webm";
    if (ext === "mov") return "video/quicktime";
    if (ext === "m4v") return "video/x-m4v";
    return "video/mp4";
}

export function validateUploadedVideoBlob(blob, storagePath) {
    if (!blob || typeof blob.size !== "number" || blob.size <= 0) {
        throw new Error("Uploaded video object is empty.");
    }
    const type = String(blob.type || "").trim().toLowerCase();
    const pathType = inferVideoContentTypeFromPath(storagePath);
    if (type && !type.startsWith("video/") && !type.startsWith("application/octet-stream")) {
        throw new Error(`Uploaded video object has unexpected content-type: ${type || "none"}`);
    }
    if (!type && !/\.(mp4|webm|mov|m4v)$/i.test(storagePath)) {
        throw new Error(`Uploaded video path is not a recognized video file: ${storagePath}`);
    }
    return {
        ok: true,
        size: blob.size,
        contentType: type || pathType,
    };
}
