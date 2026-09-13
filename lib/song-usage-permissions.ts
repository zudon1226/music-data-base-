/**
 * Song release usage permissions (streaming vs ringtone).
 * One master song record — no duplicate uploads for Streaming + Ringtone.
 */

export type SongUsagePermissions = {
    streaming_enabled: boolean;
    ringtone_enabled: boolean;
    ringtone_creation_enabled: boolean;
    ringtone_sale_enabled: boolean;
    ringtone_price: number | null;
};

export const DEFAULT_EXISTING_SONG_USAGE: SongUsagePermissions = {
    streaming_enabled: true,
    ringtone_enabled: false,
    ringtone_creation_enabled: false,
    ringtone_sale_enabled: false,
    ringtone_price: null,
};

export const DEFAULT_NEW_UPLOAD_USAGE: SongUsagePermissions = {
    streaming_enabled: true,
    ringtone_enabled: false,
    ringtone_creation_enabled: false,
    ringtone_sale_enabled: false,
    ringtone_price: null,
};

const SONG_USAGE_COLUMN_NAMES = [
    "streaming_enabled",
    "ringtone_enabled",
    "ringtone_creation_enabled",
    "ringtone_sale_enabled",
    "ringtone_price",
] as const;

export function isSongUsageColumnError(message: string) {
    const lower = message.toLowerCase();
    return SONG_USAGE_COLUMN_NAMES.some((column) => lower.includes(column));
}

function parseBooleanFlag(value: unknown, fallback: boolean) {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    if (value === null || value === undefined || value === "") return fallback;
    return Boolean(value);
}

function parseRingtonePrice(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.round(parsed * 100) / 100;
}

/** Normalize upload/API body into persisted song usage fields. */
export function parseSongUsageFromBody(body: Record<string, unknown>): SongUsagePermissions | { error: string } {
    const streamingEnabled = parseBooleanFlag(
        body.streamingEnabled ?? body.streaming_enabled,
        DEFAULT_NEW_UPLOAD_USAGE.streaming_enabled,
    );
    const ringtoneEnabled = parseBooleanFlag(
        body.ringtoneEnabled ?? body.ringtone_enabled,
        DEFAULT_NEW_UPLOAD_USAGE.ringtone_enabled,
    );

    if (!streamingEnabled && !ringtoneEnabled) {
        return { error: "Select at least one release usage option: Streaming or Ringtone." };
    }

    const ringtoneCreationEnabled = ringtoneEnabled
        ? parseBooleanFlag(
            body.ringtoneCreationEnabled ?? body.ringtone_creation_enabled,
            false,
        )
        : false;
    const ringtoneSaleEnabled = ringtoneEnabled
        ? parseBooleanFlag(
            body.ringtoneSaleEnabled ?? body.ringtone_sale_enabled,
            false,
        )
        : false;

    let ringtonePrice: number | null = null;
    if (ringtoneSaleEnabled) {
        ringtonePrice = parseRingtonePrice(body.ringtonePrice ?? body.ringtone_price);
        if (ringtonePrice === null) {
            return { error: "Enter a valid ringtone price when offering a ringtone for sale." };
        }
    }

    return {
        streaming_enabled: streamingEnabled,
        ringtone_enabled: ringtoneEnabled,
        ringtone_creation_enabled: ringtoneCreationEnabled,
        ringtone_sale_enabled: ringtoneSaleEnabled,
        ringtone_price: ringtonePrice,
    };
}

export function songAllowsRingtoneCreation(record: Record<string, unknown>) {
    const hasUsageColumns = "ringtone_enabled" in record || "ringtone_creation_enabled" in record;
    if (!hasUsageColumns) {
        return true;
    }
    return record.ringtone_enabled === true && record.ringtone_creation_enabled === true;
}

export function songAllowsStreaming(record: Record<string, unknown>) {
    if (record.streaming_enabled === false) return false;
    if (record.ringtone_enabled === true && record.streaming_enabled !== true) return false;
    if ("streaming_enabled" in record) {
        return record.streaming_enabled !== false;
    }
    return true;
}

/** Public Music Library catalog: exclude ringtone-only masters. */
export function isPublicStreamingCatalogSong(record: Record<string, unknown>) {
    return songAllowsStreaming(record);
}

export function isRingtoneOnlySong(record: Record<string, unknown>) {
    if ("ringtone_enabled" in record || "streaming_enabled" in record) {
        return record.ringtone_enabled === true && record.streaming_enabled === false;
    }
    return false;
}
