/** Profile field validation / sanitization for User Dashboard Phase 1. */

export const PROFILE_FIELD_LIMITS = {
    displayName: 80,
    username: 32,
    biography: 500,
    city: 80,
    country: 80,
    website: 200,
} as const;

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/i;
const WEBSITE_RE = /^https?:\/\/[^\s<>"'`]+$/i;

export type ProfileEditableFields = {
    displayName: string;
    username: string;
    biography: string;
    city: string;
    country: string;
    website: string;
    avatarUrl: string;
};

export function sanitizePlainText(value: unknown, maxLen: number) {
    return String(value ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLen);
}

export function sanitizeMultilineText(value: unknown, maxLen: number) {
    return String(value ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replace(/\r\n/g, "\n")
        .trim()
        .slice(0, maxLen);
}

export function normalizeUsername(value: unknown) {
    return sanitizePlainText(value, PROFILE_FIELD_LIMITS.username).toLowerCase();
}

export function isValidUsername(value: string) {
    if (!value) return true; // optional
    return USERNAME_RE.test(value) && value.length >= 3;
}

export function isValidWebsite(value: string) {
    if (!value) return true;
    if (!WEBSITE_RE.test(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    }
    catch {
        return false;
    }
}

export function parseProfileEditableFields(input: Record<string, unknown>): {
    fields: ProfileEditableFields;
    errors: string[];
} {
    const fields: ProfileEditableFields = {
        displayName: sanitizePlainText(input.displayName ?? input.display_name, PROFILE_FIELD_LIMITS.displayName),
        username: normalizeUsername(input.username),
        biography: sanitizeMultilineText(input.biography ?? input.bio, PROFILE_FIELD_LIMITS.biography),
        city: sanitizePlainText(input.city, PROFILE_FIELD_LIMITS.city),
        country: sanitizePlainText(input.country, PROFILE_FIELD_LIMITS.country),
        website: sanitizePlainText(input.website, PROFILE_FIELD_LIMITS.website),
        avatarUrl: sanitizePlainText(input.avatarUrl ?? input.avatar_url, 500),
    };
    const errors: string[] = [];
    if (!fields.displayName) {
        errors.push("Display name is required.");
    }
    if (fields.username && !isValidUsername(fields.username)) {
        errors.push("Username must be 3–32 characters and use letters, numbers, dots, underscores, or hyphens.");
    }
    if (!isValidWebsite(fields.website)) {
        errors.push("Website must be a valid http(s) URL.");
    }
    return { fields, errors };
}
