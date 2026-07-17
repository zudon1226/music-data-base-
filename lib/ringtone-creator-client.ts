/** Client helpers for Ringtone Platform Phase 2 creator UI. */

import type { Session } from "@supabase/supabase-js";
import { readAccessTokenFromSession } from "@/lib/client-api-auth";
import {
    RINGTONE_DEFAULT_DURATION_SECONDS,
    RINGTONE_MAX_DURATION_SECONDS,
    RINGTONE_MIN_DURATION_SECONDS,
    type RingtoneCurrency,
    type RingtoneStatus,
} from "@/lib/ringtone-constants";

export type RingtoneProduct = {
    id: string;
    creator_id: string;
    source_song_id: string | null;
    title: string;
    description: string;
    artwork_url: string;
    preview_url: string;
    duration_seconds: number;
    clip_start_seconds: number;
    clip_end_seconds: number;
    price_cents: number;
    currency: string;
    status: RingtoneStatus;
    is_explicit: boolean;
    ownership_confirmed: boolean;
    source_kind: "owned_song" | "upload";
    source_storage_path: string;
    review_notes: string;
    iphone_available?: boolean;
    android_available?: boolean;
    revision_number?: number;
    last_processing_error?: string;
    last_processing_error_code?: string;
    preview_storage_path?: string;
    iphone_storage_path?: string;
    android_storage_path?: string;
    created_at: string;
    updated_at: string;
    published_at: string | null;
};

export type RingtoneProcessingJob = {
    id: string;
    ringtone_id: string;
    status: "queued" | "processing" | "completed" | "failed" | "canceled";
    attempt_count?: number;
    max_attempts?: number;
    error_code?: string;
    error_message?: string;
    revision_number?: number;
};

export type RingtoneSourceSong = {
    id: string;
    title: string;
    artist: string;
    artworkUrl: string;
    audioUrl: string;
    storagePath: string;
    durationSeconds: number;
    createdAt: string | null;
};

export type RingtoneSalesSummary = {
    saleCount: number;
    earningsCents: number;
    revenueCents: number;
    platformFeeCents?: number;
    currency: string;
};

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

export function clampRingtoneDuration(sourceDurationSeconds: number, preferred = RINGTONE_DEFAULT_DURATION_SECONDS) {
    if (!Number.isFinite(sourceDurationSeconds) || sourceDurationSeconds < RINGTONE_MIN_DURATION_SECONDS) {
        return RINGTONE_MIN_DURATION_SECONDS;
    }
    return Math.min(
        RINGTONE_MAX_DURATION_SECONDS,
        preferred,
        Math.floor(sourceDurationSeconds),
    );
}

export function maxClipStartSeconds(sourceDurationSeconds: number, durationSeconds: number) {
    return Math.max(0, Number((sourceDurationSeconds - durationSeconds).toFixed(3)));
}

export function formatRingtoneMoney(cents: number, currency = "USD") {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: currency || "USD",
        }).format((Number(cents) || 0) / 100);
    } catch {
        return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
    }
}

export function formatClipClock(seconds: number) {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.round((safe % 1) * 10);
    return `${mins}:${String(secs).padStart(2, "0")}.${ms}`;
}

export async function fetchRingtoneEligibility(userId: string, session: Session | null) {
    const response = await fetch(`/api/ringtones/eligibility?userId=${encodeURIComponent(userId)}`, {
        headers: authHeaders(session, false),
        cache: "no-store",
    });
    const parsed = await parseJson(response);
    return {
        ok: parsed.ok,
        status: parsed.status,
        canCreateRingtones: parsed.body.canCreateRingtones === true,
        error: typeof parsed.body.error === "string" ? parsed.body.error : "",
    };
}

export async function fetchMyRingtones(userId: string, session: Session | null) {
    const response = await fetch(`/api/ringtones?mine=1&userId=${encodeURIComponent(userId)}`, {
        headers: authHeaders(session, false),
        cache: "no-store",
    });
    const parsed = await parseJson(response);
    return {
        ok: parsed.ok,
        status: parsed.status,
        ringtones: Array.isArray(parsed.body.ringtones) ? parsed.body.ringtones as RingtoneProduct[] : [],
        error: typeof parsed.body.error === "string" ? parsed.body.error : "",
    };
}

export async function fetchOwnedSourceSongs(userId: string, session: Session | null) {
    const response = await fetch(`/api/ringtones/source-songs?userId=${encodeURIComponent(userId)}`, {
        headers: authHeaders(session, false),
        cache: "no-store",
    });
    const parsed = await parseJson(response);
    return {
        ok: parsed.ok,
        status: parsed.status,
        songs: Array.isArray(parsed.body.songs) ? parsed.body.songs as RingtoneSourceSong[] : [],
        error: typeof parsed.body.error === "string" ? parsed.body.error : "",
    };
}

export async function fetchRingtoneSales(userId: string, session: Session | null) {
    const response = await fetch(`/api/ringtones/sales?userId=${encodeURIComponent(userId)}`, {
        headers: authHeaders(session, false),
        cache: "no-store",
    });
    const parsed = await parseJson(response);
    return {
        ok: parsed.ok,
        status: parsed.status,
        sales: Array.isArray(parsed.body.sales) ? parsed.body.sales : [],
        summary: (parsed.body.summary || {
            saleCount: 0,
            earningsCents: 0,
            revenueCents: 0,
            currency: "USD",
        }) as RingtoneSalesSummary,
        error: typeof parsed.body.error === "string" ? parsed.body.error : "",
    };
}

export async function prepareRingtoneSourceUpload(input: {
    userId: string;
    session: Session | null;
    mimeType: string;
    byteLength: number;
    ownershipConfirmed: boolean;
}) {
    const response = await fetch("/api/ringtones/upload-source", {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            mimeType: input.mimeType,
            byteLength: input.byteLength,
            ownershipConfirmed: input.ownershipConfirmed,
        }),
    });
    return parseJson(response);
}

export async function signRingtoneSourceUrl(input: {
    userId: string;
    session: Session | null;
    storagePath: string;
}) {
    const response = await fetch("/api/ringtones/source-url", {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            storagePath: input.storagePath,
        }),
    });
    return parseJson(response);
}

export async function saveRingtoneDraft(input: {
    userId: string;
    session: Session | null;
    ringtoneId?: string;
    payload: Record<string, unknown>;
}) {
    if (input.ringtoneId) {
        const response = await fetch(`/api/ringtones/${input.ringtoneId}`, {
            method: "PATCH",
            headers: authHeaders(input.session),
            body: JSON.stringify({ userId: input.userId, ...input.payload }),
        });
        return parseJson(response);
    }
    const response = await fetch("/api/ringtones", {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({ userId: input.userId, ...input.payload }),
    });
    return parseJson(response);
}

/**
 * Submit starts secure server-side processing. Pending review is set only after
 * successful outputs — creators cannot skip processing.
 */
export async function submitRingtoneForReview(input: {
    userId: string;
    session: Session | null;
    ringtoneId: string;
    retry?: boolean;
}) {
    const response = await fetch(`/api/ringtones/${input.ringtoneId}/process`, {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            retry: input.retry === true,
        }),
    });
    return parseJson(response);
}

export async function retryRingtoneProcessing(input: {
    userId: string;
    session: Session | null;
    ringtoneId: string;
}) {
    return submitRingtoneForReview({ ...input, retry: true });
}

export async function fetchRingtoneProcessingJob(input: {
    userId: string;
    session: Session | null;
    ringtoneId: string;
}) {
    const response = await fetch(
        `/api/ringtones/${input.ringtoneId}/process?userId=${encodeURIComponent(input.userId)}`,
        {
            headers: authHeaders(input.session, false),
            cache: "no-store",
        },
    );
    const parsed = await parseJson(response);
    return {
        ok: parsed.ok,
        status: parsed.status,
        job: (parsed.body.job || null) as RingtoneProcessingJob | null,
        error: typeof parsed.body.error === "string" ? parsed.body.error : "",
    };
}

export async function duplicateRingtone(input: {
    userId: string;
    session: Session | null;
    ringtoneId: string;
}) {
    const response = await fetch(`/api/ringtones/${input.ringtoneId}/duplicate`, {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({ userId: input.userId }),
    });
    return parseJson(response);
}

export async function deleteOrArchiveRingtone(input: {
    userId: string;
    session: Session | null;
    ringtoneId: string;
    status: RingtoneStatus;
}) {
    // Already soft-retained — never hard-delete archived products (moderation history is immutable).
    if (input.status === "archived") {
        return { ok: true, status: 200, body: { deleted: false, retained: true, archived: true, idempotent: true } };
    }
    if (["published", "approved", "suspended"].includes(input.status)) {
        const response = await fetch(`/api/ringtones/${input.ringtoneId}`, {
            method: "PATCH",
            headers: authHeaders(input.session),
            body: JSON.stringify({ userId: input.userId, status: "archived" }),
        });
        return parseJson(response);
    }
    const response = await fetch(
        `/api/ringtones/${input.ringtoneId}?userId=${encodeURIComponent(input.userId)}`,
        {
            method: "DELETE",
            headers: authHeaders(input.session, false),
        },
    );
    const parsed = await parseJson(response);
    if (
        !parsed.ok
        && (parsed.body.code === "ARCHIVE_REQUIRED" || parsed.body.code === "MODERATION_HISTORY_RETAINED")
    ) {
        const archive = await fetch(`/api/ringtones/${input.ringtoneId}`, {
            method: "PATCH",
            headers: authHeaders(input.session),
            body: JSON.stringify({ userId: input.userId, status: "archived" }),
        });
        return parseJson(archive);
    }
    return parsed;
}

/** Return an archived/published ringtone to an editable draft for re-review. */
export async function returnRingtoneToReview(input: {
    userId: string;
    session: Session | null;
    ringtoneId: string;
    status: RingtoneStatus;
}) {
    if (["published", "suspended"].includes(input.status)) {
        // Empty PATCH on published/suspended starts a purchase-safe draft revision.
        const response = await fetch(`/api/ringtones/${input.ringtoneId}`, {
            method: "PATCH",
            headers: authHeaders(input.session),
            body: JSON.stringify({ userId: input.userId }),
        });
        return parseJson(response);
    }
    const response = await fetch(`/api/ringtones/${input.ringtoneId}`, {
        method: "PATCH",
        headers: authHeaders(input.session),
        body: JSON.stringify({ userId: input.userId, status: "draft" }),
    });
    return parseJson(response);
}

export function formatRingtoneClientError(error: unknown, fallback: string) {
    const message = typeof error === "string"
        ? error
        : error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "")
            : String(error || "");
    if (
        !message
        || /ringtone_moderation_logs|is immutable|violates foreign key|PGRST|postgres|sqlstate|relation /i.test(message)
    ) {
        return fallback;
    }
    return message;
}

export type CreateRingtoneFormState = {
    sourceKind: "owned_song" | "upload";
    sourceSongId: string;
    sourceSongTitle: string;
    sourceAudioUrl: string;
    sourceStoragePath: string;
    sourceDurationSeconds: number;
    ownershipConfirmed: boolean;
    clipStartSeconds: number;
    durationSeconds: number;
    title: string;
    description: string;
    artworkUrl: string;
    priceDollars: string;
    currency: RingtoneCurrency;
    isExplicit: boolean;
    iphoneAvailable: boolean;
    androidAvailable: boolean;
};

export function createEmptyRingtoneForm(): CreateRingtoneFormState {
    return {
        sourceKind: "owned_song",
        sourceSongId: "",
        sourceSongTitle: "",
        sourceAudioUrl: "",
        sourceStoragePath: "",
        sourceDurationSeconds: 0,
        ownershipConfirmed: false,
        clipStartSeconds: 0,
        durationSeconds: RINGTONE_DEFAULT_DURATION_SECONDS,
        title: "",
        description: "",
        artworkUrl: "",
        priceDollars: "0.99",
        currency: "USD",
        isExplicit: false,
        iphoneAvailable: true,
        androidAvailable: true,
    };
}

export function formToSavePayload(form: CreateRingtoneFormState, submitForReview = false) {
    const dollars = Number(form.priceDollars);
    const priceCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : NaN;
    return {
        sourceKind: form.sourceKind,
        sourceSongId: form.sourceKind === "owned_song" ? form.sourceSongId : undefined,
        ownershipConfirmed: form.ownershipConfirmed || form.sourceKind === "owned_song",
        clipStartSeconds: form.clipStartSeconds,
        durationSeconds: form.durationSeconds,
        sourceDurationSeconds: form.sourceDurationSeconds || undefined,
        title: form.title,
        description: form.description,
        artworkUrl: form.artworkUrl,
        priceCents,
        currency: form.currency,
        isExplicit: form.isExplicit,
        sourceStoragePath: form.sourceKind === "upload" ? form.sourceStoragePath : undefined,
        iphoneAvailable: form.iphoneAvailable,
        androidAvailable: form.androidAvailable,
        submitForReview,
    };
}
