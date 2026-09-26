import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import {
    canReceiveFoundingArtistDesignation,
    setFoundingArtistDesignation,
} from "@/lib/founding-artist-designation";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const adminUserId = url.searchParams.get("userId")?.trim() || "";
        const targetUserId = url.searchParams.get("targetUserId")?.trim() || "";

        if (!adminUserId || !isUuid(adminUserId)) {
            return NextResponse.json({ error: "Admin user id is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(request, "/api/launch/founding-artist-designation", adminUserId);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const admin = await requireAdminUserId(adminUserId);
        if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

        if (!targetUserId || !isUuid(targetUserId)) {
            return NextResponse.json({ error: "targetUserId is required." }, { status: 400 });
        }

        const supabase = getSupabaseServerClient();
        const { data: profile, error } = await supabase
            .from("profiles")
            .select("id,user_id,display_name,username,account_type,is_founding_artist,founding_artist_since")
            .or(`id.eq.${targetUserId},user_id.eq.${targetUserId}`)
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!profile) {
            return NextResponse.json({ error: "Profile not found." }, { status: 404 });
        }

        const row = profile as Record<string, unknown>;
        const accountType = String(row.account_type || "");
        return NextResponse.json({
            profile: {
                userId: String(row.user_id || row.id || targetUserId),
                displayName: String(row.display_name || row.username || "").trim(),
                username: String(row.username || "").trim(),
                accountType,
                isFoundingArtist: Boolean(row.is_founding_artist),
                foundingArtistSince: row.founding_artist_since ? String(row.founding_artist_since) : null,
            },
            eligible: canReceiveFoundingArtistDesignation(accountType),
        });
    }
    catch (error) {
        console.error("[api/launch/founding-artist-designation] GET error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const adminUserId = typeof body.userId === "string" ? body.userId.trim() : "";
        const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
        const action = typeof body.action === "string" ? body.action.trim() : "";

        if (!adminUserId || !isUuid(adminUserId)) {
            return NextResponse.json({ error: "Admin user id is required." }, { status: 401 });
        }
        const auth = await requireMatchingUserId(
            request,
            "/api/launch/founding-artist-designation",
            adminUserId,
            getSessionTokensFromRecord(body),
        );
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const admin = await requireAdminUserId(adminUserId);
        if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

        if (!targetUserId || !isUuid(targetUserId)) {
            return NextResponse.json({ error: "targetUserId is required." }, { status: 400 });
        }
        if (action !== "grant" && action !== "remove") {
            return NextResponse.json({ error: "Use action grant or remove." }, { status: 400 });
        }

        const supabase = getSupabaseServerClient();
        const result = await setFoundingArtistDesignation({
            supabase,
            targetUserId,
            grant: action === "grant",
        });

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error },
                { status: "status" in result ? result.status : 400 },
            );
        }

        return NextResponse.json({ ok: true, profile: result.profile });
    }
    catch (error) {
        console.error("[api/launch/founding-artist-designation] PATCH error:", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
