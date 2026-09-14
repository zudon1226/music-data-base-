import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import {
    getPlatformErrorServiceClient,
    insertPlatformError,
    isMissingPlatformErrorsTable,
    normalizePlatformErrorCategory,
    PLATFORM_ERROR_SELECT,
    sanitizePlatformErrorDetails,
} from "@/lib/platform-error-reporting";
import { getSessionTokensFromRecord, resolveStrictRequestUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const scope = (url.searchParams.get("scope") || "mine").trim().toLowerCase();
        const requestedUserId = url.searchParams.get("userId")?.trim() || "";

        const resolved = await resolveStrictRequestUserId(request);
        if (!resolved.userId) {
            return jsonResponse({ error: resolved.error || "Sign in to view error reports.", errors: [] }, 401);
        }

        if (requestedUserId && !isUuid(requestedUserId)) {
            return jsonResponse({ error: "Invalid user id.", errors: [] }, 400);
        }

        const admin = await isAdminUserId(resolved.userId);

        if (requestedUserId && requestedUserId !== resolved.userId && !admin) {
            return jsonResponse({ error: "You may only view your own error reports.", errors: [] }, 403);
        }

        const globalScope = scope === "global" || scope === "all";
        if (globalScope && !admin) {
            return jsonResponse({ error: "Admin permission is required for platform-wide error reports.", errors: [] }, 403);
        }

        const supabase = getPlatformErrorServiceClient();
        let query = supabase
            .from("platform_errors")
            .select(PLATFORM_ERROR_SELECT)
            .order("created_at", { ascending: false })
            .limit(100);

        if (globalScope) {
            if (requestedUserId && admin) {
                query = query.eq("user_id", requestedUserId);
            }
        }
        else {
            const targetUserId = admin && requestedUserId ? requestedUserId : resolved.userId;
            query = query.eq("user_id", targetUserId);
        }

        const { data, error } = await query;
        if (error) {
            if (isMissingPlatformErrorsTable(error)) {
                return jsonResponse({
                    errors: [],
                    setupRequired: true,
                    error: "Run the platform_errors migration to enable persistent error reports.",
                });
            }
            console.error("[api/platform/errors] load failed:", error);
            return jsonResponse({ error: getErrorMessage(error), errors: [] }, 500);
        }

        return jsonResponse({ errors: data || [] });
    }
    catch (error) {
        console.error("[api/platform/errors] server error:", error);
        return jsonResponse({ error: getErrorMessage(error), errors: [] }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const tokens = getSessionTokensFromRecord(body);
        const resolved = await resolveStrictRequestUserId(request, tokens);
        if (!resolved.userId) {
            return jsonResponse({ error: resolved.error || "Sign in to report errors." }, 401);
        }

        const rawCategory = typeof body.category === "string" ? body.category.trim() : "unknown";
        const category = normalizePlatformErrorCategory(rawCategory);
        const action = typeof body.action === "string" ? body.action.trim() || "unknown" : "unknown";
        const message = typeof body.message === "string" ? body.message.trim() : "";
        const itemId = typeof body.itemId === "string" ? body.itemId.trim() : typeof body.item_id === "string" ? body.item_id.trim() : "";
        const itemType = typeof body.itemType === "string" ? body.itemType.trim() : typeof body.item_type === "string" ? body.item_type.trim() : "";
        const details = sanitizePlatformErrorDetails(body.details);

        if (!message) return jsonResponse({ error: "Error message is required." }, 400);

        const supabase = getPlatformErrorServiceClient();
        const { data, error } = await insertPlatformError(supabase, {
            userId: resolved.userId,
            category,
            action,
            message,
            itemId: itemId || null,
            itemType: itemType || null,
            details,
        });

        if (error) {
            if (isMissingPlatformErrorsTable(error)) {
                return jsonResponse({ ok: true, setupRequired: true });
            }
            console.error("[api/platform/errors] insert failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }

        return jsonResponse({ ok: true, error: data });
    }
    catch (error) {
        console.error("[api/platform/errors] server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
