export function formatLocalizedDate(value: string | number | Date, locale: string, options: Intl.DateTimeFormatOptions = {}) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatLocalizedNumber(value: number, locale: string, options: Intl.NumberFormatOptions = {}) {
    return new Intl.NumberFormat(locale, options).format(value);
}

export function formatLocalizedCurrency(
    value: number,
    locale: string,
    currency = "USD",
    options: Intl.NumberFormatOptions = {},
) {
    return new Intl.NumberFormat(locale, { style: "currency", currency, ...options }).format(value);
}

import { isRtlLocale } from "./registry";

export function getDocumentDirection(locale: string) {
    return isRtlLocale(locale) ? "rtl" : "ltr";
}
