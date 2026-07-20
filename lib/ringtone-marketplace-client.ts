/** Client helpers for Ringtone Platform Phase 3 marketplace / purchase UI. */

import type { Session } from "@supabase/supabase-js";
import { readAccessTokenFromSession } from "@/lib/client-api-auth";
import { parseFilenameFromContentDisposition } from "@/lib/ringtone-download-filename";
import { randomUUID } from "@/lib/ringtone-marketplace-id";

function authHeaders(session: Session | null | undefined, json = true) {
    const token = readAccessTokenFromSession(session);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (json) headers["Content-Type"] = "application/json";
    return headers;
}

async function parseJson(response: Response) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body };
}

export type MarketplaceRingtone = {
    id: string;
    creator_id: string;
    title: string;
    description?: string;
    artwork_url: string;
    preview_url: string;
    duration_seconds: number;
    clip_start_seconds?: number;
    clip_end_seconds?: number;
    price_cents: number;
    currency: string;
    status: string;
    is_featured?: boolean;
    is_explicit?: boolean;
    source_song_id?: string | null;
    creatorName?: string;
    sourceSongTitle?: string;
    sourceGenre?: string;
    purchaseCount?: number;
    downloadCount?: number;
    favoriteCount?: number;
    owned?: boolean;
    favorited?: boolean;
    published_at?: string | null;
    created_at?: string;
};

export async function fetchRingtoneMarketplace(input: {
    userId?: string;
    session?: Session | null;
    q?: string;
    filter?: string;
    sort?: string;
    section?: string;
    creatorId?: string;
    page?: number;
    pageSize?: number;
    minPriceCents?: number;
    maxPriceCents?: number;
}) {
    const params = new URLSearchParams();
    if (input.userId) params.set("userId", input.userId);
    if (input.q) params.set("q", input.q);
    if (input.filter) params.set("filter", input.filter);
    if (input.sort) params.set("sort", input.sort);
    if (input.section) params.set("section", input.section);
    if (input.creatorId) params.set("creatorId", input.creatorId);
    if (input.page) params.set("page", String(input.page));
    if (input.pageSize) params.set("pageSize", String(input.pageSize));
    if (input.minPriceCents != null) params.set("minPriceCents", String(input.minPriceCents));
    if (input.maxPriceCents != null) params.set("maxPriceCents", String(input.maxPriceCents));

    const response = await fetch(`/api/ringtones/marketplace?${params.toString()}`, {
        headers: authHeaders(input.session || null, false),
        cache: "no-store",
    });
    return parseJson(response);
}

export async function fetchRingtoneDetail(input: {
    ringtoneId: string;
    userId?: string;
    session?: Session | null;
}) {
    const params = new URLSearchParams();
    if (input.userId) params.set("userId", input.userId);
    const response = await fetch(`/api/ringtones/${input.ringtoneId}/detail?${params.toString()}`, {
        headers: authHeaders(input.session || null, false),
        cache: "no-store",
    });
    return parseJson(response);
}

export async function purchaseRingtone(input: {
    ringtoneId: string;
    userId: string;
    session: Session | null;
    idempotencyKey?: string;
}) {
    const response = await fetch(`/api/ringtones/${input.ringtoneId}/purchase`, {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            idempotencyKey: input.idempotencyKey || randomUUID(),
        }),
    });
    return parseJson(response);
}

export async function confirmRingtonePurchase(input: {
    ringtoneId: string;
    purchaseId: string;
    userId: string;
    session: Session | null;
    provider: string;
    paymentReference?: string;
    outcome?: "paid" | "failed" | "cancelled";
}) {
    const response = await fetch(`/api/ringtones/${input.ringtoneId}/purchase`, {
        method: "PATCH",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            purchaseId: input.purchaseId,
            provider: input.provider,
            paymentReference: input.paymentReference,
            outcome: input.outcome || "paid",
        }),
    });
    return parseJson(response);
}

export async function fetchMyRingtonePurchases(input: {
    userId: string;
    session: Session | null;
    q?: string;
    sort?: string;
    status?: string;
}) {
    const params = new URLSearchParams({ userId: input.userId });
    if (input.q) params.set("q", input.q);
    if (input.sort) params.set("sort", input.sort);
    if (input.status) params.set("status", input.status);
    const response = await fetch(`/api/ringtones/purchases?${params.toString()}`, {
        headers: authHeaders(input.session, false),
        cache: "no-store",
    });
    return parseJson(response);
}

export async function toggleRingtoneFavorite(input: {
    userId: string;
    session: Session | null;
    ringtoneId: string;
    favorite: boolean;
}) {
    const response = await fetch("/api/ringtone-favorites", {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            ringtoneId: input.ringtoneId,
            favorite: input.favorite,
        }),
    });
    return parseJson(response);
}

export async function fetchFavoriteRingtones(input: {
    userId: string;
    session: Session | null;
}) {
    const response = await fetch(
        `/api/ringtone-favorites?userId=${encodeURIComponent(input.userId)}&includeProducts=1`,
        {
            headers: authHeaders(input.session, false),
            cache: "no-store",
        },
    );
    return parseJson(response);
}

export async function downloadPurchasedRingtone(input: {
    ringtoneId: string;
    userId: string;
    session: Session | null;
    deviceType: "iphone" | "android";
    creatorTesting?: boolean;
}) {
    const response = await fetch(`/api/ringtones/${input.ringtoneId}/download`, {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            deviceType: input.deviceType,
            creatorTesting: input.creatorTesting === true,
        }),
    });
    return parseJson(response);
}

/**
 * Android: one POST to the secure download endpoint → one audio blob.
 * Filename comes from Content-Disposition (server title), never client guessing.
 */
export async function downloadAndroidRingtoneAudio(input: {
    ringtoneId: string;
    userId: string;
    session: Session | null;
    creatorTesting?: boolean;
}) {
    const response = await fetch(`/api/ringtones/${input.ringtoneId}/download`, {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            deviceType: "android",
            creatorTesting: input.creatorTesting === true,
        }),
    });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        return {
            ok: false as const,
            status: response.status,
            body,
        };
    }

    if (contentType.includes("application/json")) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        return {
            ok: false as const,
            status: response.status,
            body: {
                error: String(body.error || "Android download returned JSON instead of audio."),
                code: "UNEXPECTED_JSON_DOWNLOAD",
            },
        };
    }

    const blob = await response.blob();
    if (!blob || blob.size < 1) {
        return {
            ok: false as const,
            status: 500,
            body: { error: "Android download returned an empty audio file.", code: "EMPTY_AUDIO" },
        };
    }

    const filename = parseFilenameFromContentDisposition(response.headers.get("content-disposition"))
        || "ringtone.mp3";

    return {
        ok: true as const,
        status: response.status,
        blob,
        filename,
        contentType,
    };
}

/**
 * iPhone: one POST to the secure download endpoint → one audio blob.
 * Never opens a Supabase signed URL (Safari inline player).
 * Filename comes from Content-Disposition (server title), never client guessing.
 */
export async function downloadIphoneRingtoneAudio(input: {
    ringtoneId: string;
    userId: string;
    session: Session | null;
    creatorTesting?: boolean;
}) {
    const response = await fetch(`/api/ringtones/${input.ringtoneId}/download`, {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            deviceType: "iphone",
            creatorTesting: input.creatorTesting === true,
        }),
    });

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        const status = response.status;
        let fallback = "iPhone download failed.";
        if (status === 401) fallback = "Your session expired. Please sign in again to download.";
        else if (status === 403) fallback = "You are not authorized to download this ringtone.";
        else if (status === 404) fallback = "The iPhone ringtone file was not found.";
        else if (status >= 500) fallback = "Storage failed while preparing the iPhone download.";
        return {
            ok: false as const,
            status,
            body: {
                ...body,
                error: String(body.error || fallback),
            },
        };
    }

    if (contentType.includes("application/json")) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        return {
            ok: false as const,
            status: response.status,
            body: {
                error: String(body.error || "iPhone download returned JSON instead of audio."),
                code: "UNEXPECTED_JSON_DOWNLOAD",
            },
        };
    }

    const blob = await response.blob();
    if (!blob || blob.size < 1) {
        return {
            ok: false as const,
            status: 500,
            body: { error: "iPhone download returned an empty audio file.", code: "EMPTY_AUDIO" },
        };
    }

    const filename = parseFilenameFromContentDisposition(response.headers.get("content-disposition"))
        || "ringtone.m4a";

    return {
        ok: true as const,
        status: response.status,
        blob,
        filename,
        contentType,
    };
}

/** Trigger exactly one browser file save from an audio blob. */
export function triggerBrowserAudioDownload(blob: Blob, filename: string) {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

export function formatRingtonePrice(cents: number, currency = "USD") {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: currency || "USD",
        }).format((Number(cents) || 0) / 100);
    } catch {
        return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
    }
}
