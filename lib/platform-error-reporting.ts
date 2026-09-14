import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { redactSupportText } from "@/lib/support-tickets";

export const PLATFORM_ERROR_CATEGORIES = [
    "upload",
    "media_url",
    "save",
    "like",
    "playlist",
    "album",
    "storage",
    "backup",
    "follow",
    "unknown",
] as const;

export type PlatformErrorCategory = (typeof PLATFORM_ERROR_CATEGORIES)[number];

const VALID_CATEGORIES = new Set<string>(PLATFORM_ERROR_CATEGORIES);

export const PLATFORM_ERROR_SELECT =
    "id,user_id,category,action,item_id,item_type,message,details,status,created_at,resolved_at";

const MAX_DETAILS_STRING_LENGTH = 500;
const MAX_DETAILS_DEPTH = 4;
const MAX_DETAILS_KEYS = 24;

const BLOCKED_DETAIL_KEYS = new Set([
    "authorization",
    "cookie",
    "cookies",
    "password",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "session",
    "session_access_token",
    "session_refresh_token",
    "stripe",
    "stripe_signature",
    "stripe-signature",
    "webhook_secret",
    "signing_secret",
    "service_role",
    "supabase_service_role_key",
    "database_url",
    "env",
    "headers",
    "api_key",
    "apikey",
    "vercel",
    "card",
    "payment_method",
    "payment_method_details",
    "client_secret",
    "raw_body",
]);

function getSupabaseServiceClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }

    return createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

export function normalizePlatformErrorCategory(raw: string): PlatformErrorCategory {
    const category = raw.trim() || "unknown";
    return VALID_CATEGORIES.has(category) ? category as PlatformErrorCategory : "unknown";
}

function sanitizeDetailsValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (value == null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") {
        const redacted = redactSupportText(value, MAX_DETAILS_STRING_LENGTH);
        return redacted.length > MAX_DETAILS_STRING_LENGTH || redacted.includes("base64,")
            ? `${redacted.slice(0, MAX_DETAILS_STRING_LENGTH)}... [truncated]`
            : redacted;
    }
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function" || typeof value === "symbol") return `[${typeof value} removed]`;
    if (typeof Blob !== "undefined" && value instanceof Blob) {
        return { type: "Blob", size: value.size, contentType: value.type };
    }
    if (typeof FormData !== "undefined" && value instanceof FormData) return "[FormData removed]";
    if (value instanceof Error) {
        return {
            name: value.name,
            message: redactSupportText(value.message, MAX_DETAILS_STRING_LENGTH),
            stack: sanitizeDetailsValue(value.stack || "", depth + 1, seen),
        };
    }
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        if (seen.has(value)) return "[Circular array removed]";
        seen.add(value);
        const items = value.slice(0, MAX_DETAILS_KEYS).map((item) => sanitizeDetailsValue(item, depth + 1, seen));
        return value.length > MAX_DETAILS_KEYS ? [...items, `[${value.length - MAX_DETAILS_KEYS} more items removed]`] : items;
    }
    if (typeof value === "object") {
        if (seen.has(value)) return "[Circular object removed]";
        if (depth >= MAX_DETAILS_DEPTH) return "[Object details truncated]";
        seen.add(value);
        const entries = Object.entries(value as Record<string, unknown>);
        const result: Record<string, unknown> = {};
        entries.slice(0, MAX_DETAILS_KEYS).forEach(([key, item]) => {
            const normalizedKey = String(key).toLowerCase();
            if (BLOCKED_DETAIL_KEYS.has(normalizedKey) || normalizedKey.includes("secret") || normalizedKey.includes("password")) {
                result[key] = "[redacted]";
                return;
            }
            result[key] = sanitizeDetailsValue(item, depth + 1, seen);
        });
        if (entries.length > MAX_DETAILS_KEYS) result.truncatedKeys = entries.length - MAX_DETAILS_KEYS;
        return result;
    }
    return redactSupportText(String(value), MAX_DETAILS_STRING_LENGTH);
}

export function sanitizePlatformErrorDetails(details: unknown): Record<string, unknown> {
    const sanitized = sanitizeDetailsValue(details && typeof details === "object" ? details : {});
    return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
        ? sanitized as Record<string, unknown>
        : {};
}

export function sanitizePlatformErrorMessage(message: string, maxLen = 2000) {
    return redactSupportText(message.trim(), maxLen);
}

export function isMissingPlatformErrorsTable(error: unknown) {
    const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const code = String(record.code || "");
    const message = error instanceof Error ? error.message : String(record.message || error || "");
    const lower = message.toLowerCase();
    return code === "PGRST205"
        || lower.includes("platform_errors")
        || lower.includes("schema cache")
        || lower.includes("does not exist")
        || lower.includes("could not find the table");
}

export async function insertPlatformError(
    supabase: SupabaseClient,
    input: {
        userId?: string | null;
        category: string;
        action: string;
        message: string;
        itemId?: string | null;
        itemType?: string | null;
        details?: unknown;
    },
) {
    const category = normalizePlatformErrorCategory(input.category);
    const action = input.action.trim() || "unknown";
    const safeMessage = sanitizePlatformErrorMessage(input.message);
    if (!safeMessage) {
        return { data: null, error: new Error("Error message is required.") };
    }

    return supabase
        .from("platform_errors")
        .insert({
            user_id: input.userId || null,
            category,
            action,
            item_id: input.itemId || null,
            item_type: input.itemType || null,
            message: safeMessage,
            details: sanitizePlatformErrorDetails(input.details),
        })
        .select(PLATFORM_ERROR_SELECT)
        .single();
}

/** Best-effort server-side diagnostic row; never throws. */
export async function recordServerPlatformError(input: {
    userId?: string | null;
    category?: string;
    action: string;
    message: string;
    itemId?: string | null;
    itemType?: string | null;
    details?: Record<string, unknown>;
}) {
    try {
        const supabase = getSupabaseServiceClient();
        const { error } = await insertPlatformError(supabase, {
            userId: input.userId ?? null,
            category: input.category || "unknown",
            action: input.action,
            message: input.message,
            itemId: input.itemId,
            itemType: input.itemType,
            details: {
                source: "server",
                ...sanitizePlatformErrorDetails(input.details || {}),
            },
        });
        if (error && !isMissingPlatformErrorsTable(error)) {
            console.error("[platform-error-reporting] insert failed:", error);
        }
    }
    catch (error) {
        console.error("[platform-error-reporting] record failed:", error);
    }
}

export function getPlatformErrorServiceClient() {
    return getSupabaseServiceClient();
}
