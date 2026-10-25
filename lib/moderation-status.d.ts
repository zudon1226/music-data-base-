declare module "@/lib/moderation-status.mjs" {
    export const MODERATION_STATUSES: string[];
    export const MODERATION_ITEM_TYPES: string[];
    export const CATALOG_TAKEDOWN_ITEM_TYPES: Record<string, string>;
    export const CATALOG_HOLD_STATES: string[];
    export const CATALOG_MODERATION_UNKNOWN: "unknown";
    export function isModerationStatus(value: unknown): boolean;
    export function isModerationItemType(value: unknown): boolean;
    export function catalogTableForItemType(itemType: unknown): string;
    export function canTransitionModerationStatus(fromStatus: unknown, toStatus: unknown): boolean;
    export function catalogHoldFromReportStatuses(statuses: unknown): "clear" | "takedown_pending" | "removed";
    export function normalizeCatalogModerationState(
        value: unknown,
    ): "clear" | "takedown_pending" | "removed" | "unknown";
    export function isCatalogModerationStatePresent(
        record: Record<string, unknown> | null | undefined,
    ): boolean;
    export function isCatalogItemPubliclyPlayable(
        record: Record<string, unknown> | null | undefined,
    ): boolean;
    export function isCatalogItemVisibleInPrivateLibrary(
        record: Record<string, unknown> | null | undefined,
        options?: {
            viewerUserId?: string;
            ownerUserId?: string;
            ownerUserIds?: string[];
            allowOwner?: boolean;
            isAdmin?: boolean;
        },
    ): boolean;
    export function redactNonPlayableCatalogMedia<T extends Record<string, unknown>>(
        record: T | null | undefined,
    ): T | null | undefined;
    export function filterPublicCatalogRows<T extends Record<string, unknown>>(
        rows: T[] | null | undefined,
        options?: {
            viewerUserId?: string;
            ownerUserId?: string;
            ownerUserIds?: string[];
            allowOwner?: boolean;
            isAdmin?: boolean;
        },
    ): T[];
    export function isModerationHoldColumnError(error: unknown): boolean;
}
