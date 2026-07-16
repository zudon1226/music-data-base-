import type { LocaleMessageDictionary, TranslationKey, TranslationMessages } from "./messages/en";
import { enMessages } from "./messages/en";
import { esMessages } from "./messages/es";
import { frMessages } from "./messages/fr";
import { htMessages } from "./messages/ht";
import { ptMessages } from "./messages/pt";
import { deMessages } from "./messages/de";
import { itMessages } from "./messages/it";
import { nlMessages } from "./messages/nl";
import { arMessages } from "./messages/ar";
import { heMessages } from "./messages/he";
import { trMessages } from "./messages/tr";
import { ruMessages } from "./messages/ru";
import { ukMessages } from "./messages/uk";
import { plMessages } from "./messages/pl";
import { roMessages } from "./messages/ro";
import { elMessages } from "./messages/el";
import { svMessages } from "./messages/sv";
import { noMessages } from "./messages/no";
import { daMessages } from "./messages/da";
import { fiMessages } from "./messages/fi";
import { csMessages } from "./messages/cs";
import { huMessages } from "./messages/hu";
import { bgMessages } from "./messages/bg";
import { srMessages } from "./messages/sr";
import { hrMessages } from "./messages/hr";
import { bsMessages } from "./messages/bs";
import { sqMessages } from "./messages/sq";
import { etMessages } from "./messages/et";
import { lvMessages } from "./messages/lv";
import { ltMessages } from "./messages/lt";
import { skMessages } from "./messages/sk";
import { slMessages } from "./messages/sl";
import { hiMessages } from "./messages/hi";
import { bnMessages } from "./messages/bn";
import { paMessages } from "./messages/pa";
import { urMessages } from "./messages/ur";
import { guMessages } from "./messages/gu";
import { taMessages } from "./messages/ta";
import { teMessages } from "./messages/te";
import { mrMessages } from "./messages/mr";
import { neMessages } from "./messages/ne";
import { viMessages } from "./messages/vi";
import { zhCNMessages } from "./messages/zh-CN";
import { zhTWMessages } from "./messages/zh-TW";
import { jaMessages } from "./messages/ja";
import { koMessages } from "./messages/ko";
import { thMessages } from "./messages/th";
import { idMessages } from "./messages/id";
import { msMessages } from "./messages/ms";
import { filMessages } from "./messages/fil";
import { swMessages } from "./messages/sw";
import { amMessages } from "./messages/am";
import { soMessages } from "./messages/so";
import { yoMessages } from "./messages/yo";
import { igMessages } from "./messages/ig";
import { zuMessages } from "./messages/zu";
import { afMessages } from "./messages/af";
import { COMPLETE_LOCALES, DEFAULT_LOCALE, normalizeLocale } from "./registry";

const completeMessages: Record<string, LocaleMessageDictionary> = {
    en: enMessages,
    es: esMessages,
    fr: frMessages,
    ht: htMessages,
    pt: ptMessages,
    de: deMessages,
    it: itMessages,
    nl: nlMessages,
    ar: arMessages,
    he: heMessages,
    tr: trMessages,
    ru: ruMessages,
    uk: ukMessages,
    pl: plMessages,
    ro: roMessages,
    el: elMessages,
    sv: svMessages,
    no: noMessages,
    da: daMessages,
    fi: fiMessages,
    cs: csMessages,
    hu: huMessages,
    bg: bgMessages,
    sr: srMessages,
    hr: hrMessages,
    bs: bsMessages,
    sq: sqMessages,
    et: etMessages,
    lv: lvMessages,
    lt: ltMessages,
    sk: skMessages,
    sl: slMessages,
    hi: hiMessages,
    bn: bnMessages,
    pa: paMessages,
    ur: urMessages,
    gu: guMessages,
    ta: taMessages,
    te: teMessages,
    mr: mrMessages,
    ne: neMessages,
    vi: viMessages,
    "zh-CN": zhCNMessages,
    "zh-TW": zhTWMessages,
    ja: jaMessages,
    ko: koMessages,
    th: thMessages,
    id: idMessages,
    ms: msMessages,
    fil: filMessages,
    sw: swMessages,
    am: amMessages,
    so: soMessages,
    yo: yoMessages,
    ig: igMessages,
    zu: zuMessages,
    af: afMessages,
};

export function getMessagesForLocale(locale: string): TranslationMessages {
    const normalized = normalizeLocale(locale);
    if (normalized === "en") return enMessages;
    if (COMPLETE_LOCALES.has(normalized) && completeMessages[normalized]) {
        const localeMessages = completeMessages[normalized];
        return {
            ...localeMessages,
            ringtones: localeMessages.ringtones || enMessages.ringtones,
        };
    }
    return enMessages;
}

function resolvePath(messages: TranslationMessages | LocaleMessageDictionary, key: string): string | undefined {
    const parts = key.split(".");
    let current: unknown = messages;
    for (const part of parts) {
        if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === "string" ? current : undefined;
}

export function createTranslator(locale: string) {
    const normalized = normalizeLocale(locale);
    const activeMessages = getMessagesForLocale(normalized);
    const fallbackMessages = enMessages;

    return function translate(key: TranslationKey, values?: Record<string, string | number>) {
        let text = resolvePath(activeMessages, key) || resolvePath(fallbackMessages, key);
        if (!text) {
            text = resolvePath(fallbackMessages, key) || "";
        }
        if (!text) return "";
        if (!values) return text;
        return text.replace(/\{(\w+)\}/g, (_, token: string) => String(values[token] ?? ""));
    };
}

export function listTranslationKeys(messages: Record<string, unknown> = enMessages, prefix = ""): string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(messages)) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") keys.push(nextPrefix);
        else if (value && typeof value === "object") keys.push(...listTranslationKeys(value as Record<string, unknown>, nextPrefix));
    }
    return keys;
}

export function validateLocaleCompleteness(locale: string) {
    const normalized = normalizeLocale(locale);
    const requiredKeys = listTranslationKeys(enMessages);
    const localeMessages = getMessagesForLocale(normalized);
    const missing = requiredKeys.filter((key) => !resolvePath(localeMessages, key));
    return { locale: normalized, requiredKeys: requiredKeys.length, missing };
}

export { DEFAULT_LOCALE };
