export type SupportedLanguage = {
    code: string;
    englishName: string;
    nativeName: string;
    translationComplete: boolean;
    rtl: boolean;
};

/** Central supported-language registry. Add languages here without rewriting pages. */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
    { code: "en", englishName: "English", nativeName: "English", translationComplete: true, rtl: false },
    { code: "es", englishName: "Spanish", nativeName: "Español", translationComplete: true, rtl: false },
    { code: "fr", englishName: "French", nativeName: "Français", translationComplete: true, rtl: false },
    { code: "ht", englishName: "Haitian Creole", nativeName: "Kreyòl Ayisyen", translationComplete: true, rtl: false },
    { code: "pt", englishName: "Portuguese", nativeName: "Português", translationComplete: true, rtl: false },
    { code: "de", englishName: "German", nativeName: "Deutsch", translationComplete: true, rtl: false },
    { code: "it", englishName: "Italian", nativeName: "Italiano", translationComplete: true, rtl: false },
    { code: "nl", englishName: "Dutch", nativeName: "Nederlands", translationComplete: true, rtl: false },
    { code: "ar", englishName: "Arabic", nativeName: "العربية", translationComplete: true, rtl: true },
    { code: "he", englishName: "Hebrew", nativeName: "עברית", translationComplete: true, rtl: true },
    { code: "tr", englishName: "Turkish", nativeName: "Türkçe", translationComplete: true, rtl: false },
    { code: "ru", englishName: "Russian", nativeName: "Русский", translationComplete: true, rtl: false },
    { code: "uk", englishName: "Ukrainian", nativeName: "Українська", translationComplete: true, rtl: false },
    { code: "pl", englishName: "Polish", nativeName: "Polski", translationComplete: true, rtl: false },
    { code: "ro", englishName: "Romanian", nativeName: "Română", translationComplete: true, rtl: false },
    { code: "el", englishName: "Greek", nativeName: "Ελληνικά", translationComplete: true, rtl: false },
    { code: "sv", englishName: "Swedish", nativeName: "Svenska", translationComplete: false, rtl: false },
    { code: "no", englishName: "Norwegian", nativeName: "Norsk", translationComplete: false, rtl: false },
    { code: "da", englishName: "Danish", nativeName: "Dansk", translationComplete: false, rtl: false },
    { code: "fi", englishName: "Finnish", nativeName: "Suomi", translationComplete: false, rtl: false },
    { code: "cs", englishName: "Czech", nativeName: "Čeština", translationComplete: false, rtl: false },
    { code: "hu", englishName: "Hungarian", nativeName: "Magyar", translationComplete: false, rtl: false },
    { code: "bg", englishName: "Bulgarian", nativeName: "Български", translationComplete: false, rtl: false },
    { code: "sr", englishName: "Serbian", nativeName: "Srpski", translationComplete: false, rtl: false },
    { code: "hr", englishName: "Croatian", nativeName: "Hrvatski", translationComplete: false, rtl: false },
    { code: "bs", englishName: "Bosnian", nativeName: "Bosanski", translationComplete: false, rtl: false },
    { code: "sq", englishName: "Albanian", nativeName: "Shqip", translationComplete: false, rtl: false },
    { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", translationComplete: false, rtl: false },
    { code: "bn", englishName: "Bengali", nativeName: "বাংলা", translationComplete: false, rtl: false },
    { code: "pa", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ", translationComplete: false, rtl: false },
    { code: "ur", englishName: "Urdu", nativeName: "اردو", translationComplete: false, rtl: true },
    { code: "gu", englishName: "Gujarati", nativeName: "ગુજરાતી", translationComplete: false, rtl: false },
    { code: "ta", englishName: "Tamil", nativeName: "தமிழ்", translationComplete: false, rtl: false },
    { code: "te", englishName: "Telugu", nativeName: "తెలుగు", translationComplete: false, rtl: false },
    { code: "mr", englishName: "Marathi", nativeName: "मराठी", translationComplete: false, rtl: false },
    { code: "ne", englishName: "Nepali", nativeName: "नेपाली", translationComplete: false, rtl: false },
    { code: "zh-CN", englishName: "Chinese Simplified", nativeName: "简体中文", translationComplete: false, rtl: false },
    { code: "zh-TW", englishName: "Chinese Traditional", nativeName: "繁體中文", translationComplete: false, rtl: false },
    { code: "ja", englishName: "Japanese", nativeName: "日本語", translationComplete: false, rtl: false },
    { code: "ko", englishName: "Korean", nativeName: "한국어", translationComplete: false, rtl: false },
    { code: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt", translationComplete: false, rtl: false },
    { code: "th", englishName: "Thai", nativeName: "ไทย", translationComplete: false, rtl: false },
    { code: "id", englishName: "Indonesian", nativeName: "Bahasa Indonesia", translationComplete: false, rtl: false },
    { code: "ms", englishName: "Malay", nativeName: "Bahasa Melayu", translationComplete: false, rtl: false },
    { code: "fil", englishName: "Filipino", nativeName: "Filipino", translationComplete: false, rtl: false },
    { code: "sw", englishName: "Swahili", nativeName: "Kiswahili", translationComplete: false, rtl: false },
    { code: "am", englishName: "Amharic", nativeName: "አማርኛ", translationComplete: false, rtl: false },
    { code: "so", englishName: "Somali", nativeName: "Soomaali", translationComplete: false, rtl: false },
    { code: "yo", englishName: "Yoruba", nativeName: "Yorùbá", translationComplete: false, rtl: false },
    { code: "ig", englishName: "Igbo", nativeName: "Igbo", translationComplete: false, rtl: false },
    { code: "zu", englishName: "Zulu", nativeName: "isiZulu", translationComplete: false, rtl: false },
    { code: "af", englishName: "Afrikaans", nativeName: "Afrikaans", translationComplete: false, rtl: false },
];

export const DEFAULT_LOCALE = "en";
export const LOCALE_STORAGE_KEY = "mdb.preferredLanguage";
export const LOCALE_COOKIE_KEY = "mdb_locale";
export const COMPLETE_LOCALES = new Set(
    SUPPORTED_LANGUAGES.filter((language) => language.translationComplete).map((language) => language.code),
);

const registryByCode = new Map(SUPPORTED_LANGUAGES.map((language) => [language.code, language]));

export function isSupportedLocale(value: string) {
    return registryByCode.has(value);
}

export function normalizeLocale(value: string | null | undefined) {
    const clean = String(value || "").trim();
    if (!clean) return DEFAULT_LOCALE;
    if (registryByCode.has(clean)) return clean;
    const lower = clean.toLowerCase();
    const exact = SUPPORTED_LANGUAGES.find((language) => language.code.toLowerCase() === lower);
    if (exact) return exact.code;
    const base = lower.split("-")[0];
    const baseMatch = SUPPORTED_LANGUAGES.find((language) => language.code.toLowerCase() === base);
    return baseMatch?.code || DEFAULT_LOCALE;
}

export function getLanguageDefinition(code: string) {
    return registryByCode.get(normalizeLocale(code)) || registryByCode.get(DEFAULT_LOCALE)!;
}

export function isRtlLocale(code: string) {
    return getLanguageDefinition(code).rtl;
}

export function listLanguagesSorted() {
    return [...SUPPORTED_LANGUAGES].sort((left, right) => left.nativeName.localeCompare(right.nativeName, "en"));
}

export function validateLanguageRegistry() {
    const codes = SUPPORTED_LANGUAGES.map((language) => language.code);
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
    const missingFields = SUPPORTED_LANGUAGES.filter((language) =>
        !language.code || !language.englishName || !language.nativeName,
    ).map((language) => language.code || "(missing code)");
    return {
        count: SUPPORTED_LANGUAGES.length,
        duplicates: [...new Set(duplicates)],
        missingFields,
        valid: duplicates.length === 0 && missingFields.length === 0,
    };
}
