import { NextResponse } from "next/server";
import { findAdminUserByEmail } from "@/lib/admin-auth-users";
import { authMetadataNeedsRepair } from "@/lib/auth-user-metadata";
import {
    getErrorMessage,
    getSupabaseServerClient,
    PLATFORM_OWNER_EMAIL,
} from "@/lib/server-supabase";
import { repairAuthUserMetadata } from "@/lib/sync-auth-user-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET() {
    return jsonResponse({
        ok: true,
        route: "/api/auth/repair-metadata",
        methods: ["POST"],
        ownerEmail: PLATFORM_OWNER_EMAIL,
    });
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const email = String(body.email || PLATFORM_OWNER_EMAIL).trim().toLowerCase();

        if (email !== PLATFORM_OWNER_EMAIL) {
            return jsonResponse({ error: "Auth metadata repair is limited to the platform owner account." }, 403);
        }

        const supabase = getSupabaseServerClient();
        const authUser = await findAdminUserByEmail(supabase, email);
        if (!authUser?.id) {
            return jsonResponse({ error: "Owner account not found." }, 404);
        }

        const userId = authUser.id;
        const currentMetadata = (authUser.user_metadata || {}) as Record<string, unknown>;
        if (!authMetadataNeedsRepair(currentMetadata)) {
            return jsonResponse({
                ok: true,
                repaired: false,
                metadataChanged: false,
                userId,
                userMetadata: currentMetadata,
            });
        }

        const repairResult = await repairAuthUserMetadata(supabase, userId);
        return jsonResponse({
            ok: true,
            repaired: repairResult.repaired,
            metadataChanged: repairResult.metadataChanged,
            userId,
            userMetadata: repairResult.userMetadata,
        });
    }
    catch (error) {
        console.error("[api/auth/repair-metadata] failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
