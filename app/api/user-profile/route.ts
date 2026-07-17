import { normalizeLocale } from "@/lib/i18n/registry";
import { parseProfileEditableFields } from "@/lib/dashboard/profile-fields";
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

const PROFILE_SELECT = [
    "display_name",
    "username",
    "account_type",
    "is_admin",
    "avatar_url",
    "bio",
    "city",
    "country",
    "website",
    "preferred_language",
    "created_at",
    "public_slug",
].join(",");

async function countOwned(supabase: ReturnType<typeof getSupabaseServerClient>, table: string, userId: string) {
    const { count } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
    return Number(count || 0);
}

async function countFollowers(supabase: ReturnType<typeof getSupabaseServerClient>, userId: string) {
    // Followers are rows where artist_id matches this user's id (legacy text column).
    const { count } = await supabase
        .from("artist_follows")
        .select("id", { count: "exact", head: true })
        .eq("artist_id", userId);
    return Number(count || 0);
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
        const { data: profileData } = await supabase
            .from("profiles")
            .select(PROFILE_SELECT)
            .or(`id.eq.${userId},user_id.eq.${userId}`)
            .maybeSingle();
        const profileRow = (profileData || {}) as Record<string, unknown>;

        const userResult = await supabase.auth.admin.getUserById(userId);
        const email = userResult.data.user?.email || "";
        const createdAt = String(profileRow.created_at || userResult.data.user?.created_at || "").trim();
        const displayName = String(profileRow.display_name || email.split("@")[0] || "").trim();
        const role = normalizeRole(profileRow.account_type);
        const avatarUrl = String(profileRow.avatar_url || "").trim();

        const roleSet = new Set<string>();
        if (role && role !== "listener") roleSet.add(role);
        if (profileRow.is_admin === true) roleSet.add("admin");
        try {
            const rolesResult = await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", userId)
                .eq("status", "active");
            for (const row of rolesResult.data || []) {
                const clean = String((row as { role?: string }).role || "").trim().toLowerCase();
                if (clean) roleSet.add(clean);
            }
        }
        catch {
            // user_roles may be unavailable in some environments
        }
        try {
            const artist = await supabase.from("artist_profiles").select("id").eq("user_id", userId).limit(1);
            if (!artist.error && (artist.data || []).length > 0) roleSet.add("artist");
        }
        catch {
            // optional
        }
        try {
            const producer = await supabase.from("producer_profiles").select("id").eq("user_id", userId).limit(1);
            if (!producer.error && (producer.data || []).length > 0) roleSet.add("producer");
        }
        catch {
            // optional
        }
        const roles = [...roleSet];

        let songsCount = 0;
        let videosCount = 0;
        let ringtoneCount = 0;
        let followerCount = 0;
        let followingCount = 0;
        try {
            songsCount = await countOwned(supabase, "songs", userId);
            videosCount = await countOwned(supabase, "videos", userId);
        }
        catch {
            // tables may vary in local/dev
        }
        try {
            const { count } = await supabase
                .from("ringtone_products")
                .select("id", { count: "exact", head: true })
                .eq("owner_user_id", userId);
            ringtoneCount = Number(count || 0);
        }
        catch {
            ringtoneCount = 0;
        }
        try {
            const follows = await supabase
                .from("artist_follows")
                .select("id", { count: "exact", head: true })
                .eq("user_id", userId);
            followingCount = Number(follows.count || 0);
        }
        catch {
            followingCount = 0;
        }
        try {
            followerCount = await countFollowers(supabase, userId);
        }
        catch {
            followerCount = 0;
        }

        return jsonResponse({
            displayName,
            username: String(profileRow.username || "").trim(),
            role,
            roles,
            isArtist: roleSet.has("artist") || roleSet.has("founding_artist"),
            isProducer: roleSet.has("producer") || roleSet.has("founding_producer"),
            isAdmin: roleSet.has("admin"),
            avatarUrl,
            biography: String(profileRow.bio || "").trim(),
            city: String(profileRow.city || "").trim(),
            country: String(profileRow.country || "").trim(),
            website: String(profileRow.website || "").trim(),
            preferredLanguage: normalizeLocale(String(profileRow.preferred_language || "en")),
            createdAt,
            publicSlug: String(profileRow.public_slug || "").trim(),
            stats: {
                followerCount,
                followingCount,
                songsCount,
                videosCount,
                ringtoneCount,
            },
            isOwner: true,
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

        if (action === "update" || action === "update-profile") {
            const parsed = parseProfileEditableFields(body);
            if (parsed.errors.length > 0) {
                return jsonResponse({ error: parsed.errors[0], errors: parsed.errors }, 400);
            }
            const { fields } = parsed;

            if (fields.username) {
                const { data: conflict } = await supabase
                    .from("profiles")
                    .select("id,user_id")
                    .ilike("username", fields.username)
                    .limit(5);
                const taken = (conflict || []).some((row) => {
                    const id = String(row.id || "");
                    const uid = String(row.user_id || "");
                    return id !== userId && uid !== userId;
                });
                if (taken) {
                    return jsonResponse({ error: "That username is already taken." }, 409);
                }
            }

            await ensureProfileRow(supabase, userId, {
                displayName: fields.displayName,
                avatarUrl: fields.avatarUrl || undefined,
            });

            const updateResult = await supabase
                .from("profiles")
                .update({
                    display_name: fields.displayName,
                    username: fields.username || null,
                    bio: fields.biography || null,
                    city: fields.city || null,
                    country: fields.country || null,
                    website: fields.website || null,
                    avatar_url: fields.avatarUrl || null,
                    updated_at: new Date().toISOString(),
                })
                .or(`id.eq.${userId},user_id.eq.${userId}`);

            if (updateResult.error) {
                const message = getErrorMessage(updateResult.error);
                if (/username|unique/i.test(message)) {
                    return jsonResponse({ error: "That username is already taken." }, 409);
                }
                return jsonResponse({ error: message }, 500);
            }

            const repairResult = await repairAuthUserMetadata(supabase, userId, {
                displayName: fields.displayName,
                avatarUrl: fields.avatarUrl,
            });

            return jsonResponse({
                ok: true,
                displayName: fields.displayName,
                username: fields.username,
                biography: fields.biography,
                city: fields.city,
                country: fields.country,
                website: fields.website,
                avatarUrl: fields.avatarUrl,
                repaired: repairResult.repaired,
            });
        }

        if (action === "check-username") {
            const username = parseProfileEditableFields({ username: body.username }).fields.username;
            if (!username) {
                return jsonResponse({ ok: true, available: true });
            }
            if (!/^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/i.test(username) || username.length < 3) {
                return jsonResponse({ error: "Invalid username.", available: false }, 400);
            }
            const { data: conflict } = await supabase
                .from("profiles")
                .select("id,user_id")
                .ilike("username", username)
                .limit(5);
            const taken = (conflict || []).some((row) => {
                const id = String(row.id || "");
                const uid = String(row.user_id || "");
                return id !== userId && uid !== userId;
            });
            return jsonResponse({ ok: true, available: !taken });
        }

        if (action === "update-language") {
            const preferredLanguage = normalizeLocale(String(body.preferredLanguage || body.preferred_language || "en"));
            await ensureProfileRow(supabase, userId);
            const updateResult = await supabase
                .from("profiles")
                .update({
                    preferred_language: preferredLanguage,
                    updated_at: new Date().toISOString(),
                })
                .or(`id.eq.${userId},user_id.eq.${userId}`);
            if (updateResult.error) {
                return jsonResponse({ error: getErrorMessage(updateResult.error) }, 500);
            }
            return jsonResponse({ ok: true, preferredLanguage });
        }

        return jsonResponse({ error: "Unsupported action." }, 400);
    }
    catch (error) {
        console.error("[api/user-profile] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
