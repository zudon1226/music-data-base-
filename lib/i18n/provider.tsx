"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { getDocumentDirection } from "./format";
import type { TranslationKey } from "./messages/en";
import { DEFAULT_LOCALE, getLanguageDefinition, normalizeLocale } from "./registry";
import { detectBrowserLocale, persistLocale, readInitialLocale, readStoredLocale } from "./storage";
import { createTranslator } from "./translate";

type I18nContextValue = {
    locale: string;
    direction: "ltr" | "rtl";
    setLocale: (nextLocale: string, options?: { persistProfile?: boolean; userId?: string; accessToken?: string }) => Promise<void>;
    t: (key: TranslationKey, values?: Record<string, string | number>) => string;
    languageLabel: string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
    children: ReactNode;
    initialLocale?: string;
    profileLocale?: string | null;
    userId?: string;
    accessToken?: string;
};

async function saveProfileLocale(userId: string, accessToken: string, locale: string) {
    await fetch("/api/user-profile", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            action: "update-language",
            userId,
            sessionUserId: userId,
            accessToken,
            sessionAccessToken: accessToken,
            preferredLanguage: locale,
        }),
    });
}

export function I18nProvider({
    children,
    initialLocale,
    profileLocale,
    userId = "",
    accessToken = "",
}: I18nProviderProps) {
    const [locale, setLocaleState] = useState(() => readInitialLocale(initialLocale || readStoredLocale(), profileLocale));
    const [announcement, setAnnouncement] = useState("");

    const t = useMemo(() => createTranslator(locale), [locale]);
    const direction = getDocumentDirection(locale);
    const languageLabel = getLanguageDefinition(locale).nativeName;

    useEffect(() => {
        if (typeof document === "undefined") return;
        document.documentElement.lang = locale;
        document.documentElement.dir = direction;
        document.body.dataset.locale = locale;
        document.body.dataset.dir = direction;
    }, [direction, locale]);

    useEffect(() => {
        if (profileLocale) {
            setLocaleState(normalizeLocale(profileLocale));
            persistLocale(profileLocale);
        }
    }, [profileLocale]);

    const setLocale = useCallback(async (
        nextLocale: string,
        options: { persistProfile?: boolean; userId?: string; accessToken?: string } = {},
    ) => {
        const normalized = normalizeLocale(nextLocale);
        setLocaleState(normalized);
        persistLocale(normalized);
        const label = getLanguageDefinition(normalized).nativeName;
        setAnnouncement(createTranslator(normalized)("common.languageChanged", { language: label }));
        const effectiveUserId = options.userId || userId;
        const effectiveToken = options.accessToken || accessToken;
        if (options.persistProfile !== false && effectiveUserId && effectiveToken) {
            try {
                await saveProfileLocale(effectiveUserId, effectiveToken, normalized);
            }
            catch { /* ignore profile sync errors; local preference still applies */ }
        }
    }, [accessToken, userId]);

    const value = useMemo<I18nContextValue>(() => ({
        locale,
        direction,
        setLocale,
        t,
        languageLabel,
    }), [direction, languageLabel, locale, setLocale, t]);

    return (
        <I18nContext.Provider value={value}>
            <div dir={direction} data-locale={locale} className={direction === "rtl" ? "mdb-rtl-shell" : "mdb-ltr-shell"}>
                <span className="sr-only" aria-live="polite">{announcement}</span>
                {children}
            </div>
        </I18nContext.Provider>
    );
}

export function useTranslation() {
    const context = useContext(I18nContext);
    if (!context) {
        return {
            locale: DEFAULT_LOCALE,
            direction: "ltr" as const,
            setLocale: async () => undefined,
            t: createTranslator(DEFAULT_LOCALE),
            languageLabel: getLanguageDefinition(DEFAULT_LOCALE).nativeName,
        };
    }
    return context;
}

export function useLocaleFormatting() {
    const { locale } = useTranslation();
    return { locale };
}

export { detectBrowserLocale, readStoredLocale };
