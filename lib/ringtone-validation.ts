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
    sourceDurationSeconds?: number | null;
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
        return { ok: false, error: "Clip start must be zero or greater." };
    }

    let durationSeconds = asFiniteNumber(input.durationSeconds);
    if (durationSeconds == null && input.clipEndSeconds != null) {
        const end = asFiniteNumber(input.clipEndSeconds);
        if (end == null) return { ok: false, error: "Clip end must be a finite number." };
        durationSeconds = Number((end - clipStartSeconds).toFixed(3));
    }
    if (durationSeconds == null) {
        durationSeconds = RINGTONE_DEFAULT_DURATION_SECONDS;
    }

    durationSeconds = Number(durationSeconds.toFixed(3));
    if (durationSeconds < RINGTONE_MIN_DURATION_SECONDS || durationSeconds > RINGTONE_MAX_DURATION_SECONDS) {
        return {
            ok: false,
            error: `Ringtone duration must be between ${RINGTONE_MIN_DURATION_SECONDS} and ${RINGTONE_MAX_DURATION_SECONDS} seconds.`,
        };
    }

    const clipEndSeconds = Number((clipStartSeconds + durationSeconds).toFixed(3));
    if (clipEndSeconds <= clipStartSeconds) {
        return { ok: false, error: "Clip end must be after clip start." };
    }

    const sourceDurationSeconds = asFiniteNumber(input.sourceDurationSeconds ?? null);
    if (sourceDurationSeconds != null) {
        if (sourceDurationSeconds <= 0) {
            return { ok: false, error: "Source song duration is invalid." };
        }
        if (clipEndSeconds > sourceDurationSeconds + 0.001) {
            return { ok: false, error: "Clip end cannot exceed the source song duration." };
        }
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

/** Allowed status transitions for creators (non-admin). */
export function canCreatorTransitionStatus(from: RingtoneStatus, to: RingtoneStatus) {
    if (from === to) return true;
    if (!isCreatorEditableStatus(from) || !isCreatorEditableStatus(to)) return false;
    const allowed: Record<string, RingtoneStatus[]> = {
        draft: ["processing", "pending_review"],
        processing: ["draft", "pending_review"],
        pending_review: ["draft"],
        rejected: ["draft", "pending_review"],
    };
    return (allowed[from] || []).includes(to);
}

/** Allowed status transitions for owner/admin review workflows. */
export function canAdminTransitionStatus(from: RingtoneStatus, to: RingtoneStatus) {
    if (from === to) return true;
    if (!isRingtoneStatus(to)) return false;
    const allowed: Record<string, RingtoneStatus[]> = {
        draft: ["processing", "pending_review", "archived"],
        processing: ["pending_review", "rejected", "draft"],
        pending_review: ["approved", "rejected", "draft"],
        approved: ["published", "rejected", "suspended", "archived"],
        rejected: ["draft", "pending_review", "archived"],
        published: ["suspended", "archived", "approved"],
        suspended: ["published", "archived", "rejected"],
        archived: ["draft"],
    };
    return (allowed[from] || []).includes(to);
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
}) {
    const title = sanitizeRingtoneText(input.title, 160);
    if (!title) return { ok: false as const, error: "Title is required." };

    const sourceKind = normalizeRingtoneSourceKind(input.sourceKind);
    if (!sourceKind) return { ok: false as const, error: "sourceKind must be owned_song or upload." };

    if (sourceKind === "owned_song") {
        const songId = String(input.sourceSongId || "").trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(songId)) {
            return { ok: false as const, error: "sourceSongId must be a valid owned song UUID." };
        }
    } else if (input.ownershipConfirmed !== true) {
        return { ok: false as const, error: "Ownership confirmation is required for ringtone-only uploads." };
    }

    const clip = validateRingtoneClip({
        clipStartSeconds: Number(input.clipStartSeconds),
        durationSeconds: input.durationSeconds == null ? undefined : Number(input.durationSeconds),
        clipEndSeconds: input.clipEndSeconds == null ? undefined : Number(input.clipEndSeconds),
        sourceDurationSeconds: input.sourceDurationSeconds == null
            ? null
            : Number(input.sourceDurationSeconds),
    });
    if (!clip.ok) return clip;

    const price = validateRingtonePriceCents(input.priceCents ?? 0);
    if (!price.ok) return price;

    const currency = normalizeRingtoneCurrency(input.currency ?? "USD");
    if (!currency) return { ok: false as const, error: "Unsupported currency." };

    return {
        ok: true as const,
        row: {
            creator_id: input.creatorId,
            source_song_id: sourceKind === "owned_song" ? String(input.sourceSongId).trim() : null,
            title,
            description: sanitizeRingtoneText(input.description, 4000),
            duration_seconds: clip.durationSeconds,
            clip_start_seconds: clip.clipStartSeconds,
            clip_end_seconds: clip.clipEndSeconds,
            price_cents: price.priceCents,
            currency,
            status: "draft" as RingtoneStatus,
            is_explicit: input.isExplicit === true,
            ownership_confirmed: sourceKind === "owned_song" ? true : input.ownershipConfirmed === true,
            source_kind: sourceKind,
        },
    };
}
