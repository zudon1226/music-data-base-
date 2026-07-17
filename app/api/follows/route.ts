import { recordUserActivity } from "@/lib/dashboard/record-activity";
import { getSessionTokensFromRecord, optionalMatchingUserId, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

async function countFollowers(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string) {
    const { count } = await supabase
        .from("user_follows")
        .select("id", { count: "exact", head: true })
        .eq("following_user_id", userId);
    return Number(count || 0);
}

async function countFollowing(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string) {
    const { count } = await supabase
        .from("user_follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_user_id", userId);
    return Number(count || 0);
}

async function loadProfileSummary(supabase: ReturnType<typeof getSupabaseServerClient>, userIds: string[]) {
    const unique = [...new Set(userIds.filter((id) => isUuid(id)))];
    if (unique.length === 0) return {} as Record<string, { displayName: string; avatarUrl: string; username: string }>;
    const [byId, byUserId] = await Promise.all([
        supabase.from("profiles").select("id,user_id,display_name,avatar_url,username").in("id", unique),
        supabase.from("profiles").select("id,user_id,display_name,avatar_url,username").in("user_id", unique),
    ]);
    const map: Record<string, { displayName: string; avatarUrl: string; username: string }> = {};
    for (const row of [...(byId.data || []), ...(byUserId.data || [])]) {
        const record = row as Record<string, unknown>;
        const id = String(record.id || "");
        const uid = String(record.user_id || "");
        const summary = {
            displayName: String(record.display_name || "").trim() || "Music Data Base user",
            avatarUrl: String(record.avatar_url || "").trim(),
            username: String(record.username || "").trim(),
        };
        if (id) map[id] = summary;
        if (uid) map[uid] = summary;
    }
    return map;
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get("userId")?.trim() || "";
        const targetUserId = url.searchParams.get("targetUserId")?.trim() || "";
        const list = url.searchParams.get("list")?.trim() || "summary";

        if (targetUserId && isUuid(targetUserId)) {
            const supabase = getSupabaseServerClient();
            const [followerCount, followingCount] = await Promise.all([
                countFollowers(supabase, targetUserId),
                countFollowing(supabase, targetUserId),
            ]);
            let isFollowing = false;
            let isFollower = false;
            let isMutual = false;
            if (userId && isUuid(userId)) {
                const auth = await optionalMatchingUserId(request, userId, { route: "/api/follows" });
                if (auth.ok) {
                    const [{ data: outgoing }, { data: incoming }] = await Promise.all([
                        supabase.from("user_follows").select("id").eq("follower_user_id", userId).eq("following_user_id", targetUserId).maybeSingle(),
                        supabase.from("user_follows").select("id").eq("follower_user_id", targetUserId).eq("following_user_id", userId).maybeSingle(),
                    ]);
                    isFollowing = Boolean(outgoing?.id);
                    isFollower = Boolean(incoming?.id);
                    isMutual = isFollowing && isFollower;
                }
            }
            return jsonResponse({
                targetUserId,
                followerCount,
                followingCount,
                isFollowing,
                isFollower,
                isMutual,
            });
        }

        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/follows", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const supabase = getSupabaseServerClient();
        if (list === "followers") {
            const { data, error } = await supabase
                .from("user_follows")
                .select("follower_user_id,created_at")
                .eq("following_user_id", userId)
                .order("created_at", { ascending: false })
                .limit(100);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            const ids = (data || []).map((row) => String(row.follower_user_id));
            const profiles = await loadProfileSummary(supabase, ids);
            return jsonResponse({
                followers: (data || []).map((row) => ({
                    userId: String(row.follower_user_id),
                    createdAt: String(row.created_at || ""),
                    ...(profiles[String(row.follower_user_id)] || { displayName: "User", avatarUrl: "", username: "" }),
                })),
            });
        }

        if (list === "following") {
            const { data, error } = await supabase
                .from("user_follows")
                .select("following_user_id,created_at")
                .eq("follower_user_id", userId)
                .order("created_at", { ascending: false })
                .limit(100);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            const ids = (data || []).map((row) => String(row.following_user_id));
            const profiles = await loadProfileSummary(supabase, ids);
            const mutualIds = new Set<string>();
            if (ids.length > 0) {
                const { data: mutual } = await supabase
                    .from("user_follows")
                    .select("follower_user_id")
                    .eq("following_user_id", userId)
                    .in("follower_user_id", ids);
                for (const row of mutual || []) mutualIds.add(String(row.follower_user_id));
            }
            return jsonResponse({
                following: (data || []).map((row) => {
                    const id = String(row.following_user_id);
                    return {
                        userId: id,
                        createdAt: String(row.created_at || ""),
                        isMutual: mutualIds.has(id),
                        ...(profiles[id] || { displayName: "User", avatarUrl: "", username: "" }),
                    };
                }),
            });
        }

        const [followerCount, followingCount] = await Promise.all([
            countFollowers(supabase, userId),
            countFollowing(supabase, userId),
        ]);
        return jsonResponse({ userId, followerCount, followingCount });
    }
    catch (error) {
        console.error("[api/follows] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const targetUserId = String(body.targetUserId || body.followingUserId || "").trim();
        const follow = body.follow !== false;
        if (!userId || !isUuid(userId) || !targetUserId || !isUuid(targetUserId)) {
            return jsonResponse({ error: "Valid userId and targetUserId are required." }, 400);
        }
        if (userId === targetUserId) {
            return jsonResponse({ error: "You cannot follow yourself." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/follows", userId, getSessionTokensFromRecord(body));
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const supabase = getSupabaseServerClient();
        if (!follow) {
            const { error } = await supabase
                .from("user_follows")
                .delete()
                .eq("follower_user_id", userId)
                .eq("following_user_id", targetUserId);
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        else {
            const { error } = await supabase.from("user_follows").upsert({
                follower_user_id: userId,
                following_user_id: targetUserId,
            }, { onConflict: "follower_user_id,following_user_id", ignoreDuplicates: true });
            if (error) return jsonResponse({ error: getErrorMessage(error) }, 500);
            await recordUserActivity(supabase, {
                actorUserId: userId,
                recipientUserId: targetUserId,
                kind: "new_follower",
                title: "New follower",
                body: "Someone started following you.",
                href: "Following",
            });
        }

        const [followerCount, followingCount, incoming] = await Promise.all([
            countFollowers(supabase, targetUserId),
            countFollowing(supabase, userId),
            supabase.from("user_follows").select("id").eq("follower_user_id", targetUserId).eq("following_user_id", userId).maybeSingle(),
        ]);
        const isFollowing = follow;
        const isMutual = isFollowing && Boolean(incoming.data?.id);

        return jsonResponse({
            ok: true,
            followed: isFollowing,
            targetUserId,
            followerCount,
            followingCount,
            isFollowing,
            isMutual,
        });
    }
    catch (error) {
        console.error("[api/follows] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
