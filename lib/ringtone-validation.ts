import {
    CREATOR_EDITABLE_STATUSES,
    PUBLIC_RINGTONE_STATUSES,
    RINGTONE_ALLOWED_AUDIO_MIME_TYPES,
    RINGTONE_DEFAULT_DURATION_SECONDS,
    RINGTONE_MAX_DURATION_SECONDS,
    RINGTONE_MIN_DURATION_SECONDS,
    RINGTONE_SOURCE_KINDS,
    RINGTONE_SOURCE_MAX_BYTES,
    RINGTONE_STATUSES,
    RINGTONE_SUPPORTED_CURRENCIES,
    type RingtoneCurrency,
    type RingtoneSourceKind,
    type RingtoneStatus,
} from "@/lib/ringtone-constants";

export type RingtoneClipInput = {
    clipStartSeconds: number;
    durationSeconds?: number;
    clipEndSeconds?: number;
    sourceDurationSeconds?: number | string | null;
};

export type RingtoneClipResult = {
    ok: true;
    clipStartSeconds: number;
    clipEndSeconds: number;
    durationSeconds: number;
} | {
    ok: false;
    error: string;
};

function asFiniteNumber(value: unknown) {
    const numberValue = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

/**
 * Canonical ringtone source duration in seconds.
 * Accepts numeric seconds and mm:ss / hh:mm:ss strings used by catalog records.
 * Returns null when duration is missing or not a positive finite length.
 * Does not guess milliseconds from large numeric values (songs.duration is seconds).
 */
export function normalizeRingtoneSourceDurationSeconds(value: unknown): number | null {
    if (value == null || value === "") return null;

    if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) return null;
        return value;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;

        const asNumber = Number(trimmed);
        if (Number.isFinite(asNumber) && asNumber > 0 && !trimmed.includes(":")) {
            return asNumber;
        }

        const parts = trimmed.split(":").map((part) => Number(part));
        if (parts.length === 2 && parts.every((part) => Number.isFinite(part))) {
            const seconds = parts[0] * 60 + parts[1];
            return seconds > 0 ? seconds : null;
        }
        if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
            const seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            return seconds > 0 ? seconds : null;
        }
        return null;
    }

    return null;
}

export const RINGTONE_SOURCE_DURATION_MISSING_MESSAGE =
    "This source is missing audio duration metadata. Reprocess or choose another source.";


export function sanitizeRingtoneText(value: unknown, maxLength: number) {
    const text = String(value ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .trim();
    return text.slice(0, maxLength);
}

export function normalizeRingtoneCurrency(value: unknown): RingtoneCurrency | null {
    const currency = String(value ?? "USD").trim().toUpperCase();
    return (RINGTONE_SUPPORTED_CURRENCIES as readonly string[]).includes(currency)
        ? currency as RingtoneCurrency
        : null;
}

export function isRingtoneStatus(value: unknown): value is RingtoneStatus {
    return (RINGTONE_STATUSES as readonly string[]).includes(String(value || ""));
}

export function isPublicRingtoneStatus(status: RingtoneStatus) {
    return (PUBLIC_RINGTONE_STATUSES as readonly string[]).includes(status);
}

export function isCreatorEditableStatus(status: RingtoneStatus) {
    return (CREATOR_EDITABLE_STATUSES as readonly string[]).includes(status);
}

export function normalizeRingtoneSourceKind(value: unknown): RingtoneSourceKind | null {
    const kind = String(value ?? "").trim();
    return (RINGTONE_SOURCE_KINDS as readonly string[]).includes(kind)
        ? kind as RingtoneSourceKind
        : null;
}

export function validateRingtoneMimeType(mimeType: unknown) {
    const normalized = String(mimeType || "").trim().toLowerCase();
    if (!(RINGTONE_ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(normalized)) {
        return { ok: false as const, error: `Unsupported audio MIME type: ${normalized || "(empty)"}` };
    }
    return { ok: true as const, mimeType: normalized };
}

export function validateRingtoneFileSize(byteLength: unknown, maxBytes = RINGTONE_SOURCE_MAX_BYTES) {
    const size = asFiniteNumber(byteLength);
    if (size == null || size <= 0) {
        return { ok: false as const, error: "Audio file size is required." };
    }
    if (size > maxBytes) {
        return { ok: false as const, error: `Audio file exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit.` };
    }
    return { ok: true as const, byteLength: size };
}

/**
 * Enforce 15–30s clip windows. Duration defaults to 30 when omitted.
 * End point is derived from start + duration; never trust a longer client end.
 */
export function validateRingtoneClip(input: RingtoneClipInput): RingtoneClipResult {
    const clipStartSeconds = asFiniteNumber(input.clipStartSeconds);
    if (clipStartSeconds == null || clipStartSeconds < 0) {
        return { ok: false, error: "Selected clip starts before the audio." };
    }

    let durationSeconds = asFiniteNumber(input.durationSeconds);
    if (durationSeconds == null && input.clipEndSeconds != null) {
        const end = asFiniteNumber(input.clipEndSeconds);
        if (end == null) return { ok: false, error: "Selected clip length is invalid." };
        durationSeconds = Number((end - clipStartSeconds).toFixed(3));
    }
    if (durationSeconds == null) {
        durationSeconds = RINGTONE_DEFAULT_DURATION_SECONDS;
    }

    durationSeconds = Number(durationSeconds.toFixed(3));
    if (durationSeconds < RINGTONE_MIN_DURATION_SECONDS || durationSeconds > RINGTONE_MAX_DURATION_SECONDS) {
        return {
            ok: false,
            error: `Selected clip length is invalid. Ringtone duration must be between ${RINGTONE_MIN_DURATION_SECONDS} and ${RINGTONE_MAX_DURATION_SECONDS} seconds.`,
        };
    }

    const clipEndSeconds = Number((clipStartSeconds + durationSeconds).toFixed(3));
    if (clipEndSeconds <= clipStartSeconds) {
        return { ok: false, error: "Selected clip length is invalid." };
    }

    const rawSourceDuration = input.sourceDurationSeconds;
    const sourceDurationSeconds = normalizeRingtoneSourceDurationSeconds(rawSourceDuration);
    // A provided but non-normalizable duration (0, NaN, "", bad string) is missing metadata — not a vague "invalid".
    if (rawSourceDuration != null && rawSourceDuration !== "" && sourceDurationSeconds == null) {
        return { ok: false, error: RINGTONE_SOURCE_DURATION_MISSING_MESSAGE };
    }
    if (sourceDurationSeconds != null && clipEndSeconds > sourceDurationSeconds + 0.001) {
        return { ok: false, error: "Selected clip ends after the source audio." };
    }

    return {
        ok: true,
        clipStartSeconds: Number(clipStartSeconds.toFixed(3)),
        clipEndSeconds,
        durationSeconds,
    };
}

export function validateRingtonePriceCents(value: unknown) {
    const price = asFiniteNumber(value);
    if (price == null || !Number.isInteger(price) || price < 0) {
        return { ok: false as const, error: "Price must be an integer number of cents that is zero or greater." };
    }
    return { ok: true as const, priceCents: price };
}

/**
 * Allowed status transitions for creators (non-admin).
 * Creators queue processing (draft/rejected → processing). Only the server worker
 * may advance processing → pending_review after successful outputs.
 */
export function canCreatorTransitionStatus(from: RingtoneStatus, to: RingtoneStatus) {
    if (from === to) return true;
    const allowed: Record<string, RingtoneStatus[]> = {
        draft: ["processing", "archived"],
        processing: ["draft"],
        pending_review: ["draft"],
        rejected: ["draft", "processing", "archived"],
        // Published products require a new draft revision or archive — not silent republish.
        published: ["archived"],
        archived: ["draft"],
        suspended: ["archived"],
        approved: ["archived"],
    };
    return (allowed[from] || []).includes(to);
}

/** Allowed status transitions for owner/admin review workflows. */
export function canAdminTransitionStatus(from: RingtoneStatus, to: RingtoneStatus) {
    if (from === to) return true;
    if (!isRingtoneStatus(to)) return false;
    const allowed: Record<string, RingtoneStatus[]> = {
        draft: ["processing", "archived"],
        processing: ["pending_review", "rejected", "draft"],
        pending_review: ["approved", "rejected", "draft"],
        approved: ["published", "rejected", "archived"],
        rejected: ["draft", "processing", "archived"],
        published: ["suspended", "archived"],
        suspended: ["published", "archived"],
        archived: ["draft"],
    };
    return (allowed[from] || []).includes(to);
}

const RINGTONE_DRAFT_DEFAULT_TITLE = "Untitled draft";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RingtoneSaveMode = "draft" | "submit";

/** Submit-for-review field checks shared by client wizard and server create/update. */
export function validateRingtoneSubmitRequirements(input: {
    sourceKind: unknown;
    sourceSongId?: unknown;
    sourceStoragePath?: unknown;
    ownershipConfirmed?: unknown;
    title?: unknown;
    clipStartSeconds?: unknown;
    durationSeconds?: unknown;
    clipEndSeconds?: unknown;
    sourceDurationSeconds?: unknown;
    priceCents?: unknown;
    currency?: unknown;
    iphoneAvailable?: unknown;
    androidAvailable?: unknown;
}): { ok: true } | { ok: false; error: string; step: 1 | 2 | 3 | 4 | 5 } {
    const sourceKind = normalizeRingtoneSourceKind(input.sourceKind);
    if (!sourceKind) {
        return { ok: false, error: "Choose source audio before submitting for review.", step: 1 };
    }
    if (sourceKind === "owned_song") {
        const songId = String(input.sourceSongId || "").trim();
        if (!UUID_RE.test(songId)) {
            return { ok: false, error: "Choose source audio before submitting for review.", step: 1 };
        }
    } else {
        if (input.ownershipConfirmed !== true) {
            return {
                ok: false,
                error: "Confirm ownership of the uploaded source audio before submitting for review.",
                step: 1,
            };
        }
        const sourceStoragePath = sanitizeRingtoneText(input.sourceStoragePath, 500);
        if (!sourceStoragePath) {
            return { ok: false, error: "Choose source audio before submitting for review.", step: 1 };
        }
    }

    const sourceDurationSeconds = normalizeRingtoneSourceDurationSeconds(input.sourceDurationSeconds);
    if (sourceKind === "owned_song" && sourceDurationSeconds == null) {
        return { ok: false, error: RINGTONE_SOURCE_DURATION_MISSING_MESSAGE, step: 1 };
    }

    const clip = validateRingtoneClip({
        clipStartSeconds: Number(input.clipStartSeconds ?? 0),
        durationSeconds: input.durationSeconds == null ? undefined : Number(input.durationSeconds),
        clipEndSeconds: input.clipEndSeconds == null ? undefined : Number(input.clipEndSeconds),
        sourceDurationSeconds,
    });
    if (!clip.ok) return { ok: false, error: clip.error, step: 2 };

    const title = sanitizeRingtoneText(input.title, 160);
    if (!title || title.toLowerCase() === RINGTONE_DRAFT_DEFAULT_TITLE.toLowerCase()) {
        return { ok: false, error: "Add a title before submitting for review.", step: 3 };
    }

    const price = validateRingtonePriceCents(input.priceCents ?? 0);
    if (!price.ok) return { ok: false, error: price.error, step: 3 };
    const currency = normalizeRingtoneCurrency(input.currency ?? "USD");
    if (!currency) return { ok: false, error: "Unsupported currency.", step: 3 };

    if (input.iphoneAvailable === false && input.androidAvailable === false) {
        return {
            ok: false,
            error: "Enable iPhone or Android availability before submitting for review.",
            step: 4,
        };
    }

    return { ok: true };
}

export function buildCreateRingtonePayload(input: {
    creatorId: string;
    title: unknown;
    description?: unknown;
    sourceKind: unknown;
    sourceSongId?: unknown;
    ownershipConfirmed?: unknown;
    clipStartSeconds: unknown;
    durationSeconds?: unknown;
    clipEndSeconds?: unknown;
    sourceDurationSeconds?: unknown;
    priceCents?: unknown;
    currency?: unknown;
    isExplicit?: unknown;
    artworkUrl?: unknown;
    sourceStoragePath?: unknown;
    iphoneAvailable?: unknown;
    androidAvailable?: unknown;
}, options?: { mode?: RingtoneSaveMode }) {
    const mode: RingtoneSaveMode = options?.mode === "submit" ? "submit" : "draft";

    if (mode === "submit") {
        const requirements = validateRingtoneSubmitRequirements(input);
        if (!requirements.ok) return { ok: false as const, error: requirements.error };
    }

    let title = sanitizeRingtoneText(input.title, 160);
    if (!title) {
        if (mode === "draft") title = RINGTONE_DRAFT_DEFAULT_TITLE;
        else return { ok: false as const, error: "Title is required." };
    }

    const sourceKind = normalizeRingtoneSourceKind(input.sourceKind)
        || (mode === "draft" ? "owned_song" as RingtoneSourceKind : null);
    if (!sourceKind) return { ok: false as const, error: "sourceKind must be owned_song or upload." };

    let sourceSongId: string | null = null;
    if (sourceKind === "owned_song") {
        const songId = String(input.sourceSongId || "").trim();
        if (songId) {
            if (!UUID_RE.test(songId)) {
                return { ok: false as const, error: "sourceSongId must be a valid owned song UUID." };
            }
            sourceSongId = songId;
        } else if (mode === "submit") {
            return { ok: false as const, error: "Choose source audio before submitting for review." };
        }
    } else if (mode === "submit" && input.ownershipConfirmed !== true) {
        return { ok: false as const, error: "Ownership confirmation is required for ringtone-only uploads." };
    } else if (mode === "draft" && String(input.sourceStoragePath || "").trim() && input.ownershipConfirmed !== true) {
        return { ok: false as const, error: "Ownership confirmation is required for ringtone-only uploads." };
    }

    const rawSourceDuration = normalizeRingtoneSourceDurationSeconds(input.sourceDurationSeconds);
    const sourceDurationSeconds = rawSourceDuration;

    let clip = validateRingtoneClip({
        clipStartSeconds: Number(input.clipStartSeconds ?? 0),
        durationSeconds: input.durationSeconds == null ? undefined : Number(input.durationSeconds),
        clipEndSeconds: input.clipEndSeconds == null ? undefined : Number(input.clipEndSeconds),
        sourceDurationSeconds,
    });
    if (!clip.ok) {
        if (mode === "submit") return clip;
        // Drafts keep a schema-safe default 0–30s window when clip data is incomplete/invalid.
        clip = validateRingtoneClip({
            clipStartSeconds: 0,
            durationSeconds: RINGTONE_DEFAULT_DURATION_SECONDS,
            sourceDurationSeconds: null,
        });
        if (!clip.ok) return clip;
    }

    let price = validateRingtonePriceCents(input.priceCents ?? 0);
    if (!price.ok) {
        if (mode === "submit") return price;
        // Drafts fall back to $0.00 when price is blank/invalid.
        price = validateRingtonePriceCents(0);
        if (!price.ok) return price;
    }

    const currency = normalizeRingtoneCurrency(input.currency ?? "USD");
    if (!currency) return { ok: false as const, error: "Unsupported currency." };

    const sourceStoragePath = sanitizeRingtoneText(input.sourceStoragePath, 500);
    if (sourceKind === "upload" && sourceStoragePath) {
        if (!sourceStoragePath.startsWith(`${input.creatorId}/`)) {
            return { ok: false as const, error: "sourceStoragePath must be owner-scoped under the creator id." };
        }
    }

    return {
        ok: true as const,
        row: {
            creator_id: input.creatorId,
            source_song_id: sourceKind === "owned_song" ? sourceSongId : null,
            title,
            description: sanitizeRingtoneText(input.description, 4000),
            artwork_url: sanitizeRingtoneText(input.artworkUrl, 1000),
            duration_seconds: clip.durationSeconds,
            clip_start_seconds: clip.clipStartSeconds,
            clip_end_seconds: clip.clipEndSeconds,
            price_cents: price.priceCents,
            currency,
            status: "draft" as RingtoneStatus,
            is_explicit: input.isExplicit === true,
            ownership_confirmed: sourceKind === "owned_song"
                ? Boolean(sourceSongId) || input.ownershipConfirmed === true
                : input.ownershipConfirmed === true,
            source_kind: sourceKind,
            // Upload drafts store ringtone-source paths; owned songs resolve from songs at process time.
            source_storage_path: sourceKind === "upload" ? sourceStoragePath : "",
            iphone_available: input.iphoneAvailable !== false,
            android_available: input.androidAvailable !== false,
        },
    };
}
