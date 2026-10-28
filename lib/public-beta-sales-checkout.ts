/**
 * Public beta paid catalog sales checkout lock.
 *
 * Environment: NEXT_PUBLIC_PUBLIC_BETA_PAID_SALES_CHECKOUT_LOCKED
 *
 * Semantics (read literally — do not invert):
 *   true  / 1 / yes / on / UNSET / empty / unrecognized → checkout LOCKED
 *   false / 0 / no  / off                               → checkout UNLOCKED
 *
 * Unlocking paid song, album, and beat checkout is a full-launch setting.
 * During public beta leave the variable unset or set it to true.
 * Setting false, 0, no, or off is the deliberate unlock. There is no bypass.
 *
 * Free catalog checkout does not use this lock.
 */

export const PUBLIC_BETA_PAID_SALES_CHECKOUT_ENV =
    "NEXT_PUBLIC_PUBLIC_BETA_PAID_SALES_CHECKOUT_LOCKED";
export const PUBLIC_BETA_PAID_SALES_CHECKOUT_MESSAGE =
    "Purchases coming at full launch.";
export const PUBLIC_BETA_PAID_SALES_CHECKOUT_CODE = "SALES_CHECKOUT_LOCKED";

function parseLockEnv(value: string | undefined) {
    if (value === undefined || value === "") return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

/** When true, paid song, album, and beat checkout stays blocked. */
export function isPublicBetaPaidSalesCheckoutLocked() {
    const parsed = parseLockEnv(process.env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SALES_CHECKOUT_LOCKED);
    if (parsed === null) return true;
    return parsed;
}

export function getPublicBetaPaidSalesCheckoutMessage() {
    return PUBLIC_BETA_PAID_SALES_CHECKOUT_MESSAGE;
}

export function paidSalesCheckoutLockedResult() {
    return {
        ok: false as const,
        status: 403 as const,
        code: PUBLIC_BETA_PAID_SALES_CHECKOUT_CODE,
        error: PUBLIC_BETA_PAID_SALES_CHECKOUT_MESSAGE,
    };
}

export function isFreeCatalogCheckoutItem(item: { isFree?: boolean; priceCents?: number }) {
    return item.isFree === true || Math.max(0, Number(item.priceCents) || 0) <= 0;
}

/**
 * Free checkout may continue while the lock is on.
 * Paid rows are omitted and must not be inserted or sent to Stripe.
 */
export function selectCheckoutItemsUnderBetaLock<T extends { isFree?: boolean; priceCents?: number }>(items: T[]) {
    if (!isPublicBetaPaidSalesCheckoutLocked()) {
        return { locked: false as const, items, droppedPaidItems: [] as T[] };
    }
    const droppedPaidItems = items.filter((item) => !isFreeCatalogCheckoutItem(item));
    const kept = items.filter((item) => isFreeCatalogCheckoutItem(item));
    return { locked: true as const, items: kept, droppedPaidItems };
}
