import { NextResponse } from "next/server";
import { authMetadataNeedsRepair } from "@/lib/auth-user-metadata";
import {
    getErrorMessage,
    getSupabaseServerClient,
    isPlatformOwnerEmail,
    isUuid,
} from "@/lib/server-supabase";
import { repairAuthUserMetadata } from "@/lib/sync-auth-user-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const email = String(body.email || "").trim().toLowerCase();
        const userId = String(body.userId || "").trim();

        if (!email || !isPlatformOwnerEmail(email)) {
            return jsonResponse({ error: "Auth metadata repair is limited to the platform owner account." }, 403);
        }
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }

        const supabase = getSupabaseServerClient();
        const userResult = await supabase.auth.admin.getUserById(userId);
        const authUser = userResult.data.user;
        if (userResult.error || !authUser) {
            return jsonResponse({ error: getErrorMessage(userResult.error || "User not found.") }, 404);
        }
        if (String(authUser.email || "").trim().toLowerCase() !== email) {
            return jsonResponse({ error: "User id does not match the owner email." }, 403);
        }

        const currentMetadata = (authUser.user_metadata || {}) as Record<string, unknown>;
        if (!authMetadataNeedsRepair(currentMetadata)) {
            return jsonResponse({
                ok: true,
                repaired: false,
                metadataChanged: false,
                userMetadata: currentMetadata,
            });
        }

        const repairResult = await repairAuthUserMetadata(supabase, userId);
        return jsonResponse({
            ok: true,
            repaired: repairResult.repaired,
            metadataChanged: repairResult.metadataChanged,
            userMetadata: repairResult.userMetadata,
        });
    }
    catch (error) {
        console.error("[api/auth/repair-metadata] failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
