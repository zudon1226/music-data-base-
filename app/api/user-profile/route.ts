import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { getSessionTokensFromRecord, optionalMatchingUserId, requireMatchingUserId } from "@/lib/request-auth";
import { ensureProfileRow, repairAuthUserMetadata } from "@/lib/sync-auth-user-metadata";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function normalizeRole(value: unknown) {
    const cleanValue = String(value || "").trim().toLowerCase();
    if (cleanValue === "admin" || cleanValue === "producer" || cleanValue === "artist") {
        return cleanValue;
    }
    return "listener";
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await optionalMatchingUserId(request, userId, { route: "/api/user-profile" });
        if (!auth.ok) {
            return jsonResponse({
                displayName: "",
                role: "listener",
                avatarUrl: "",
            });
        }

        const supabase = getSupabaseServerClient();
        const { data: profileRow } = await supabase
            .from("profiles")
            .select("display_name,account_type,avatar_url")
            .or(`id.eq.${userId},user_id.eq.${userId}`)
            .maybeSingle();

        const userResult = await supabase.auth.admin.getUserById(userId);
        const email = userResult.data.user?.email || "";
        const displayName = String(profileRow?.display_name || email.split("@")[0] || "").trim();
        const role = normalizeRole(profileRow?.account_type);
        const avatarUrl = String(profileRow?.avatar_url || "").trim();

        return jsonResponse({
            displayName,
            role,
            avatarUrl,
        });
    }
    catch (error) {
        console.error("[api/user-profile] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = String(body.action || "").trim();
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/user-profile", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const supabase = getSupabaseServerClient();
        const displayName = String(body.displayName || "").trim();
        const avatarUrl = String(body.avatarUrl || body.avatar_url || "").trim();
        const role = body.role === undefined ? "" : normalizeRole(body.role);
        const patch = {
            displayName: displayName || undefined,
            avatarUrl: avatarUrl || undefined,
            role: role || undefined,
        };

        if (action === "ensure" || action === "repair-auth-metadata") {
            const profileFields = await ensureProfileRow(supabase, userId, patch);
            const repairResult = await repairAuthUserMetadata(supabase, userId, profileFields);
            return jsonResponse({
                ok: true,
                action,
                displayName: profileFields.displayName,
                role: profileFields.role,
                avatarUrl: profileFields.avatarUrl,
                repaired: repairResult.repaired,
                metadataChanged: repairResult.metadataChanged,
                userMetadata: repairResult.userMetadata,
            });
        }

        if (action === "update") {
            const profileFields = await ensureProfileRow(supabase, userId, patch);
            const repairResult = await repairAuthUserMetadata(supabase, userId, profileFields);
            return jsonResponse({
                ok: true,
                displayName: profileFields.displayName,
                role: profileFields.role,
                avatarUrl: profileFields.avatarUrl,
                repaired: repairResult.repaired,
                metadataChanged: repairResult.metadataChanged,
                userMetadata: repairResult.userMetadata,
            });
        }

        return jsonResponse({ error: "Unsupported action." }, 400);
    }
    catch (error) {
        console.error("[api/user-profile] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
