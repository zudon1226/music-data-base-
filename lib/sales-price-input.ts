/**
 * Creator upload pricing — maps request bodies to authoritative `price_cents`.
 * Checkout still resolves prices via `lib/sales-catalog.ts` at purchase time.
 */

export const SALES_PRICE_MAX_CENTS = 999_999;

export function validateSalesPriceCents(value: unknown): { ok: true; priceCents: number } | { ok: false; error: string } {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
        return { ok: false, error: "Price must be a whole number of cents (0 or greater)." };
    }
    if (numeric < 0 || numeric > SALES_PRICE_MAX_CENTS) {
        return { ok: false, error: `Price must be between 0 and ${SALES_PRICE_MAX_CENTS} cents.` };
    }
    return { ok: true, priceCents: numeric };
}

function dollarsToCents(value: unknown): number | null {
    const dollars = typeof value === "number" ? value : Number(String(value ?? "").trim());
    if (!Number.isFinite(dollars) || dollars < 0) return null;
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(cents)) return null;
    return cents;
}

/**
 * Accepts integer cents or dollar strings from creator upload/edit APIs.
 */
export function parseSalesPriceCentsFromBody(
    body: Record<string, unknown>,
    options?: { fieldPrefix?: "sale" | "bundle" | "track" },
): { ok: true; priceCents: number } | { ok: false; error: string } | { ok: true; priceCents: null; omitted: true } {
    const prefix = options?.fieldPrefix || "sale";
    const centKeys = prefix === "bundle"
        ? ["bundlePriceCents", "bundle_price_cents", "priceCents", "price_cents"]
        : prefix === "track"
            ? ["trackPriceCents", "track_price_cents", "salePriceCents", "sale_price_cents", "priceCents", "price_cents"]
            : ["priceCents", "price_cents", "salePriceCents", "sale_price_cents"];

    for (const key of centKeys) {
        if (body[key] === undefined || body[key] === null || String(body[key]).trim() === "") continue;
        const validated = validateSalesPriceCents(body[key]);
        if (!validated.ok) return validated;
        return validated;
    }

    const dollarKeys = prefix === "bundle"
        ? ["bundlePriceDollars", "bundle_price_dollars", "priceDollars", "price_dollars"]
        : prefix === "track"
            ? ["trackPriceDollars", "track_price_dollars", "salePriceDollars", "sale_price_dollars", "priceDollars", "price_dollars"]
            : ["priceDollars", "price_dollars", "salePriceDollars", "sale_price_dollars"];

    for (const key of dollarKeys) {
        if (body[key] === undefined || body[key] === null || String(body[key]).trim() === "") continue;
        const cents = dollarsToCents(body[key]);
        if (cents == null) {
            return { ok: false, error: "Price must be a valid dollar amount (0 or greater)." };
        }
        return validateSalesPriceCents(cents);
    }

    return { ok: true, priceCents: null, omitted: true };
}