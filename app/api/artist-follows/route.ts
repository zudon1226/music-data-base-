import { NextResponse } from "next/server";
import { logRouteAuth, requireMatchingUserId } from "@/lib/request-auth";
import { getSupabaseLibraryClient } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FOLLOW_SETUP_MESSAGE = "Artist follows table is not ready. Run the artist_follows SQL in Supabase, then refresh.";
function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}
function getErrorMessage(error: unknown) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "string")
        return error;
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        return String(record.message || record.error || record.details || record.hint || JSON.stringify(record));
    }
    return "Unknown server error";
}
function isMissingArtistFollowsTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return (code === "42p01" ||
        (message.includes("artist_follows") &&
            (message.includes("could not find the table") ||
                message.includes("does not exist") ||
                message.includes("schema cache") ||
                message.includes("relation"))));
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function getSupabaseServerClient() {
    return getSupabaseLibraryClient();
}
function getTextField(body: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
        const value = body[key];
        if (typeof value === "string" && value.trim())
            return value.trim();
    }
    return "";
}
async function getFollowerCounts(supabase: ReturnType<typeof getSupabaseServerClient>, artistIds: string[]) {
    const cleanArtistIds = artistIds.map((id) => id.trim()).filter(Boolean);
    let query = supabase.from("artist_follows").select("artist_id");
    if (cleanArtistIds.length > 0) {
        query = query.in("artist_id", cleanArtistIds);
    }
    const { data, error } = await query;
    if (error)
        throw error;
    return ((data || []) as {
        artist_id: string;
    }[]).reduce<Record<string, number>>((counts, row) => {
        counts[row.artist_id] = (counts[row.artist_id] || 0) + 1;
        return counts;
    }, {});
}
export async function GET(request: Request) {
    try {
        const searchParams = new URL(request.url).searchParams;
        const userId = searchParams.get("userId")?.trim() || searchParams.get("user_id")?.trim() || "";
        const artistIds = (searchParams.get("artistIds") || searchParams.get("artist_ids") || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        if (!userId || !isUuid(userId)) {
            logRouteAuth(request, "/api/artist-follows");
            return jsonResponse({ follows: [], followerCounts: {}, error: "Missing or invalid user_id." }, 200);
        }
        const auth = await requireMatchingUserId(request, "/api/artist-follows", userId);
        if (!auth.ok) {
            return jsonResponse({ follows: [], followerCounts: {}, error: auth.error }, auth.status);
        }
        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("artist_follows")
            .select("artist_id,artist_name,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false });
        if (error) {
            if (isMissingArtistFollowsTable(error)) {
                return jsonResponse({ follows: [], followerCounts: {}, setupRequired: true, error: FOLLOW_SETUP_MESSAGE }, 409);
            }
            console.error("[api/artist-follows] load failed:", getErrorMessage(error));
            return jsonResponse({ error: getErrorMessage(error) }, 400);
        }
        let followerCounts: Record<string, number> = {};
        try {
            followerCounts = await getFollowerCounts(supabase, artistIds);
        }
        catch (error) {
        }
        return jsonResponse({ follows: data || [], followerCounts });
    }
    catch (error) {
        console.error("[api/artist-follows] server error:", getErrorMessage(error));
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = getTextField(body, "userId", "user_id");
        const artistId = getTextField(body, "artistId", "artist_id");
        const artistName = getTextField(body, "artistName", "artist_name") || artistId;
        const shouldFollow = body.follow !== false;
        if (!userId || !isUuid(userId)) {
            logRouteAuth(request, "/api/artist-follows");
            return jsonResponse({ error: "Missing or invalid user_id. Log in again before following artists." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/artist-follows", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }
        if (!artistId) {
            return jsonResponse({ error: "Missing artist_id. Choose an artist before following." }, 400);
        }
        const supabase = getSupabaseServerClient();
        if (!shouldFollow) {
            const { error } = await supabase
                .from("artist_follows")
                .delete()
                .eq("user_id", userId)
                .eq("artist_id", artistId);
            if (error) {
                if (isMissingArtistFollowsTable(error)) {
                    return jsonResponse({ error: FOLLOW_SETUP_MESSAGE, setupRequired: true }, 409);
                }
                console.error("[api/artist-follows] unfollow failed:", getErrorMessage(error));
                return jsonResponse({ error: getErrorMessage(error) }, 400);
            }
            const followerCounts: Record<string, number> = await getFollowerCounts(supabase, [artistId]).catch((error) => {
                return {};
            });
            return jsonResponse({
                ok: true,
                followed: false,
                artistId,
                followerCount: followerCounts[artistId] || 0,
                followerCounts,
            });
        }
        const { error } = await supabase.from("artist_follows").upsert({
            artist_id: artistId,
            artist_name: artistName,
            user_id: userId,
        }, { onConflict: "artist_id,user_id", ignoreDuplicates: true });
        if (error) {
            if (isMissingArtistFollowsTable(error)) {
                return jsonResponse({ error: FOLLOW_SETUP_MESSAGE, setupRequired: true }, 409);
            }
            console.error("[api/artist-follows] follow failed:", getErrorMessage(error));
            return jsonResponse({ error: getErrorMessage(error) }, 400);
        }
        const followerCounts: Record<string, number> = await getFollowerCounts(supabase, [artistId]).catch((error) => {
            return {};
        });
        return jsonResponse({
            ok: true,
            followed: true,
            artistId,
            followerCount: followerCounts[artistId] || 1,
            followerCounts,
        });
    }
    catch (error) {
        console.error("[api/artist-follows] post server error:", getErrorMessage(error));
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
