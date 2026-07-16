import { DEFAULT_LOCALE, LOCALE_COOKIE_KEY, LOCALE_STORAGE_KEY, normalizeLocale } from "./registry";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function hasStoredLocalePreference() {
    if (typeof window === "undefined") return false;
    try {
        if (window.localStorage.getItem(LOCALE_STORAGE_KEY)) return true;
    }
    catch { /* ignore */ }
    try {
        return new RegExp(`(?:^|; )${LOCALE_COOKIE_KEY}=`).test(document.cookie);
    }
    catch { /* ignore */ }
    return false;
}

export function readStoredLocale() {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    try {
        const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        if (stored) return normalizeLocale(stored);
    }
    catch { /* ignore */ }
    try {
        const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE_KEY}=([^;]+)`));
        if (cookieMatch?.[1]) return normalizeLocale(decodeURIComponent(cookieMatch[1]));
    }
    catch { /* ignore */ }
    return DEFAULT_LOCALE;
}

export function persistLocale(locale: string) {
    const normalized = normalizeLocale(locale);
    if (typeof window === "undefined") return normalized;
    try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
    }
    catch { /* ignore */ }
    try {
        document.cookie = `${LOCALE_COOKIE_KEY}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    }
    catch { /* ignore */ }
    return normalized;
}

export function detectBrowserLocale() {
    if (typeof navigator === "undefined") return DEFAULT_LOCALE;
    const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean);
    for (const candidate of candidates) {
        const normalized = normalizeLocale(candidate);
        if (normalized) return normalized;
    }
    return DEFAULT_LOCALE;
}

export function readInitialLocale(storedLocale?: string | null, profileLocale?: string | null) {
    // Device/local preference wins, including explicit English.
    if (storedLocale) return normalizeLocale(storedLocale);
    if (typeof window !== "undefined" && hasStoredLocalePreference()) {
        return readStoredLocale();
    }
    if (profileLocale) return normalizeLocale(profileLocale);
    const stored = readStoredLocale();
    if (stored !== DEFAULT_LOCALE) return stored;
    return detectBrowserLocale();
}
