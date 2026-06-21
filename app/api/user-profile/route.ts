import { sanitizeAuthUserMetadata } from "@/lib/auth-user-metadata";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { requireMatchingUserId } from "@/lib/request-auth";
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

function mapAccountTypeToRole(accountType: unknown) {
    return normalizeRole(accountType);
}

async function syncMinimalAuthMetadata(
    supabase: ReturnType<typeof getSupabaseServerClient>,
    userId: string,
    patch: Record<string, unknown>,
) {
    const currentUser = await supabase.auth.admin.getUserById(userId);
    const currentMetadata = (currentUser.data.user?.user_metadata || {}) as Record<string, unknown>;
    const nextMetadata = sanitizeAuthUserMetadata({
        ...currentMetadata,
        ...patch,
    });
    const { error } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: nextMetadata,
    });
    if (error) {
        throw error;
    }
    return nextMetadata;
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/user-profile", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const supabase = getSupabaseServerClient();
        const [profileResult, userResult] = await Promise.all([
            supabase
                .from("profiles")
                .select("display_name,account_type,avatar_url")
                .or(`id.eq.${userId},user_id.eq.${userId}`)
                .maybeSingle(),
            supabase.auth.admin.getUserById(userId),
        ]);

        const authMetadata = (userResult.data.user?.user_metadata || {}) as Record<string, unknown>;
        const profileRow = profileResult.data;
        const displayName = String(profileRow?.display_name || authMetadata.displayName || userResult.data.user?.email?.split("@")[0] || "").trim();
        const role = mapAccountTypeToRole(profileRow?.account_type || authMetadata.role || authMetadata.accountRole);
        const avatarUrl = String(profileRow?.avatar_url || authMetadata.avatarUrl || authMetadata.avatar_url || "").trim();

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
        const auth = await requireMatchingUserId(request, "/api/user-profile", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const supabase = getSupabaseServerClient();
        const displayName = String(body.displayName || "").trim();
        const avatarUrl = String(body.avatarUrl || body.avatar_url || "").trim();
        const role = body.role === undefined ? "" : normalizeRole(body.role);

        if (action === "ensure") {
            const userResult = await supabase.auth.admin.getUserById(userId);
            const email = userResult.data.user?.email || "";
            const metadata = (userResult.data.user?.user_metadata || {}) as Record<string, unknown>;
            const resolvedDisplayName = displayName
                || String(metadata.displayName || "").trim()
                || email.split("@")[0]
                || "Music Data Base user";
            const resolvedRole = role || mapAccountTypeToRole(metadata.role || metadata.accountRole);

            await supabase.from("profiles").upsert({
                id: userId,
                user_id: userId,
                display_name: resolvedDisplayName,
                account_type: resolvedRole,
                avatar_url: avatarUrl || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: "id" });

            const syncedMetadata = await syncMinimalAuthMetadata(supabase, userId, {
                displayName: resolvedDisplayName,
                role: resolvedRole,
                avatarUrl: avatarUrl || undefined,
            });

            return jsonResponse({
                ok: true,
                displayName: resolvedDisplayName,
                role: resolvedRole,
                avatarUrl,
                userMetadata: syncedMetadata,
            });
        }

        if (action === "update") {
            const profilePatch: Record<string, unknown> = {
                id: userId,
                user_id: userId,
                updated_at: new Date().toISOString(),
            };
            if (displayName) {
                profilePatch.display_name = displayName;
            }
            if (avatarUrl) {
                profilePatch.avatar_url = avatarUrl;
            }
            if (role) {
                profilePatch.account_type = role;
            }

            const { error: profileError } = await supabase.from("profiles").upsert(profilePatch, { onConflict: "id" });
            if (profileError) {
                return jsonResponse({ error: getErrorMessage(profileError) }, 500);
            }

            const metadataPatch: Record<string, unknown> = {};
            if (displayName) {
                metadataPatch.displayName = displayName;
            }
            if (avatarUrl) {
                metadataPatch.avatarUrl = avatarUrl;
            }
            if (role) {
                metadataPatch.role = role;
            }

            const syncedMetadata = await syncMinimalAuthMetadata(supabase, userId, metadataPatch);
            return jsonResponse({
                ok: true,
                displayName: displayName || syncedMetadata.displayName || "",
                role: role || syncedMetadata.role || "listener",
                avatarUrl: avatarUrl || syncedMetadata.avatarUrl || "",
                userMetadata: syncedMetadata,
            });
        }

        return jsonResponse({ error: "Unsupported action." }, 400);
    }
    catch (error) {
        console.error("[api/user-profile] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
