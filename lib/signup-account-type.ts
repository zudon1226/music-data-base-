/**
 * Signup account-type selection (Listener / Artist / Producer / Artist & Producer).
 * Reuses profiles.account_type + user_roles; does not invent a parallel role system.
 */

export const SIGNUP_ACCOUNT_TYPES = [
    "listener",
    "artist",
    "producer",
    "artist_producer",
] as const;

export type SignupAccountType = (typeof SIGNUP_ACCOUNT_TYPES)[number];

export const DEFAULT_SIGNUP_ACCOUNT_TYPE: SignupAccountType = "listener";

const SIGNUP_ACCOUNT_TYPE_MARKER_PREFIX = "mdb_signup_account_type=";

export function normalizeSignupAccountType(value: unknown): SignupAccountType | null {
    const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (normalized === "artist_and_producer" || normalized === "artist&producer") {
        return "artist_producer";
    }
    return (SIGNUP_ACCOUNT_TYPES as readonly string[]).includes(normalized)
        ? normalized as SignupAccountType
        : null;
}

export function requireSignupAccountType(value: unknown): SignupAccountType {
    return normalizeSignupAccountType(value) || DEFAULT_SIGNUP_ACCOUNT_TYPE;
}

/** Missing/empty → default Listener. Non-empty unknown values are rejected. */
export function parseSignupAccountTypeInput(value: unknown): {
    ok: true;
    accountType: SignupAccountType;
} | {
    ok: false;
    error: string;
} {
    if (value == null || String(value).trim() === "") {
        return { ok: true, accountType: DEFAULT_SIGNUP_ACCOUNT_TYPE };
    }
    const normalized = normalizeSignupAccountType(value);
    if (!normalized) {
        return {
            ok: false,
            error: "Invalid account type. Choose Listener, Artist, Producer, or Artist & Producer.",
        };
    }
    return { ok: true, accountType: normalized };
}

export function encodeSignupAccountTypeMarker(accountType: SignupAccountType) {
    return `${SIGNUP_ACCOUNT_TYPE_MARKER_PREFIX}${accountType}`;
}

export function decodeSignupAccountTypeMarker(value: unknown): SignupAccountType | null {
    const text = String(value || "").trim();
    if (!text.startsWith(SIGNUP_ACCOUNT_TYPE_MARKER_PREFIX)) return null;
    return normalizeSignupAccountType(text.slice(SIGNUP_ACCOUNT_TYPE_MARKER_PREFIX.length));
}

export function signupAccountTypeLabel(accountType: SignupAccountType) {
    switch (accountType) {
        case "artist":
            return "Artist";
        case "producer":
            return "Producer";
        case "artist_producer":
            return "Artist & Producer";
        default:
            return "Listener";
    }
}

/** Roles granted after founding approval (or immediate non-beta creator setup). */
export function resolveSignupAccountTypeGrants(
    accountType: SignupAccountType,
    options?: { founding?: boolean },
) {
    const founding = options?.founding !== false;
    if (accountType === "listener") {
        return {
            primaryAccountType: "listener",
            userRoles: [] as string[],
        };
    }
    if (accountType === "artist") {
        const role = founding ? "founding_artist" : "artist";
        return { primaryAccountType: role, userRoles: [role] };
    }
    if (accountType === "producer") {
        const role = founding ? "founding_producer" : "producer";
        return { primaryAccountType: role, userRoles: [role] };
    }
    // Artist & Producer: one user, both creator roles; primary is artist-side.
    const artistRole = founding ? "founding_artist" : "artist";
    const producerRole = founding ? "founding_producer" : "producer";
    return {
        primaryAccountType: artistRole,
        userRoles: [artistRole, producerRole],
    };
}

export const ARTIST_ACCOUNT_TYPES = [
    "artist",
    "founding_artist",
    "artist_pro",
    "creator_free",
] as const;

export const PRODUCER_ACCOUNT_TYPES = [
    "producer",
    "founding_producer",
    "producer_pro",
] as const;
