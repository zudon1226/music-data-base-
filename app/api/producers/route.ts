import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
        return String(record.message || record.error || JSON.stringify(record));
    }
    return "Unknown server error";
}
function getSupabaseServerClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    }
    if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
function normalizeLicense(value: unknown) {
    if (value === "Free" || value === "Lease" || value === "Exclusive" || value === "Split percentage") {
        return value;
    }
    return "Lease";
}
function normalizeAccountType(value: unknown) {
    const cleanValue = String(value || "").trim().toLowerCase();
    if (cleanValue === "producer")
        return "producer";
    if (cleanValue === "artist")
        return "artist";
    return "listener";
}
function isMissingColumnError(error: unknown, columnName: string) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes(columnName.toLowerCase());
}
export async function GET() {
    try {
        const supabase = getSupabaseServerClient();
        const [profilesResult, beatsResult] = await Promise.all([
            supabase
                .from("producer_profiles")
                .select("id,user_id,name,avatar_url,banner_url,bio,tagline,website,followers,following,created_at")
                .order("created_at", { ascending: false }),
            supabase
                .from("producer_beats")
                .select("id,song_id,producer_id,producer_user_id,producer_name,title,category,cover_url,audio_url,storage_path,license,lease_price,exclusive_price,split_percentage,plays,likes,downloads,leases,payouts,created_at")
                .order("created_at", { ascending: false }),
        ]);
        let profilesData = profilesResult.data as Record<string, unknown>[] | null;
        let profilesError = profilesResult.error;
        if (profilesError && isMissingColumnError(profilesError, "website")) {
            const fallback = await supabase
                .from("producer_profiles")
                .select("id,user_id,name,avatar_url,banner_url,bio,tagline,followers,following,created_at")
                .order("created_at", { ascending: false });
            profilesData = fallback.data;
            profilesError = fallback.error;
        }
        let beatsData = beatsResult.data as Record<string, unknown>[] | null;
        let beatsError = beatsResult.error;
        if (beatsError && isMissingColumnError(beatsError, "category")) {
            const fallback = await supabase
                .from("producer_beats")
                .select("id,song_id,producer_id,producer_user_id,producer_name,title,cover_url,audio_url,storage_path,license,lease_price,exclusive_price,split_percentage,plays,likes,downloads,leases,payouts,created_at")
                .order("created_at", { ascending: false });
            beatsData = fallback.data;
            beatsError = fallback.error;
        }
        if (profilesError) {
        }
        if (beatsError) {
        }
        return jsonResponse({
            profiles: profilesData || [],
            beats: beatsData || [],
            profileError: profilesError ? getErrorMessage(profilesError) : "",
            beatsError: beatsError ? getErrorMessage(beatsError) : "",
        });
    }
    catch (error) {
        console.error("[api/producers] server error:", error);
        return jsonResponse({ error: getErrorMessage(error), profiles: [], beats: [] }, 500);
    }
}
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const action = String(body.action || "").trim();
        const supabase = getSupabaseServerClient();
        if (action === "upsert-profile") {
            const name = String(body.name || "").trim();
            const userId = String(body.userId || "").trim();
            if (!name || !userId) {
                return jsonResponse({ error: "Producer name and user id are required." }, 400);
            }
            const row = {
                id: String(body.id || "").trim() || crypto.randomUUID(),
                user_id: userId,
                name,
                avatar_url: String(body.avatar || "").trim(),
                banner_url: String(body.banner || "").trim(),
                bio: String(body.bio || "").trim(),
                tagline: String(body.tagline || "").trim(),
                website: String(body.website || "").trim(),
            };
            const initialProfileSave = await supabase
                .from("producer_profiles")
                .upsert(row, { onConflict: "user_id" })
                .select("id,user_id,name,avatar_url,banner_url,bio,tagline,website,followers,following,created_at")
                .single();
            let data = initialProfileSave.data as Record<string, unknown> | null;
            let error = initialProfileSave.error;
            if (error && isMissingColumnError(error, "website")) {
                const fallbackRow = { ...row };
                delete (fallbackRow as Partial<typeof row>).website;
                const fallback = await supabase
                    .from("producer_profiles")
                    .upsert(fallbackRow, { onConflict: "user_id" })
                    .select("id,user_id,name,avatar_url,banner_url,bio,tagline,followers,following,created_at")
                    .single();
                data = fallback.data;
                error = fallback.error;
            }
            if (error) {
                console.error("[api/producers] profile save failed:", error);
                return jsonResponse({ error: getErrorMessage(error) }, 500);
            }
            return jsonResponse({ profile: data });
        }
        if (action === "save-account-role") {
            const userId = String(body.userId || "").trim();
            const accountType = normalizeAccountType(body.accountType);
            const displayName = String(body.name || "").trim() || "Producer";
            if (!userId) {
                return jsonResponse({ error: "User id is required before setting account type." }, 400);
            }
            let profileWarning = "";
            const profileResult = await supabase
                .from("profiles")
                .upsert({
                id: userId,
                user_id: userId,
                account_type: accountType,
                updated_at: new Date().toISOString(),
            }, { onConflict: "id" })
                .select("id,account_type")
                .maybeSingle();
            if (profileResult.error) {
                profileWarning = getErrorMessage(profileResult.error);
            }
            let producerProfile: Record<string, unknown> | null = null;
            if (accountType === "producer") {
                const row = {
                    id: String(body.producerProfileId || "").trim() || crypto.randomUUID(),
                    user_id: userId,
                    name: displayName,
                    avatar_url: String(body.avatar || "").trim(),
                    banner_url: String(body.banner || "").trim(),
                    bio: String(body.bio || "").trim() || `${displayName} is building a producer catalog on Music Data Base.`,
                    tagline: String(body.tagline || "").trim() || "Beat maker and producer",
                };
                const { data, error } = await supabase
                    .from("producer_profiles")
                    .upsert(row, { onConflict: "user_id" })
                    .select("id,user_id,name,avatar_url,banner_url,bio,tagline,followers,following,created_at")
                    .single();
                if (error) {
                    console.error("[api/producers] producer role profile save failed:", error);
                    return jsonResponse({ error: getErrorMessage(error), profileWarning }, 500);
                }
                producerProfile = data;
            }
            return jsonResponse({
                ok: true,
                accountType,
                profile: producerProfile,
                profileWarning,
            });
        }
        if (action === "upsert-beat") {
            const title = String(body.title || "").trim();
            const producerName = String(body.producerName || "").trim();
            const producerUserId = String(body.producerUserId || "").trim();
            const songId = String(body.songId || "").trim();
            if (!title || !producerName || !producerUserId || !songId) {
                return jsonResponse({ error: "Beat title, producer, user id, and song id are required." }, 400);
            }
            const row = {
                id: String(body.id || "").trim() || crypto.randomUUID(),
                song_id: songId,
                producer_id: String(body.producerId || "").trim() || null,
                producer_user_id: producerUserId,
                producer_name: producerName,
                title,
                category: String(body.category || "").trim() || "Beats",
                cover_url: String(body.cover || "").trim(),
                audio_url: String(body.audioUrl || "").trim(),
                storage_path: String(body.storagePath || "").trim(),
                license: normalizeLicense(body.license),
                lease_price: Math.max(0, Number(body.leasePrice) || 0),
                exclusive_price: Math.max(0, Number(body.exclusivePrice) || 0),
                split_percentage: Math.max(0, Math.min(100, Number(body.splitPercentage) || 0)),
            };
            const saveBeat = async (beatRow: Record<string, unknown>, selectColumns: string) => supabase
                .from("producer_beats")
                .upsert(beatRow, { onConflict: "song_id" })
                .select(selectColumns)
                .single();
            const initialSave = await saveBeat(row, "id,song_id,producer_id,producer_user_id,producer_name,title,category,cover_url,audio_url,storage_path,license,lease_price,exclusive_price,split_percentage,plays,likes,downloads,leases,payouts,created_at");
            let data = initialSave.data;
            let error = initialSave.error;
            if (error && isMissingColumnError(error, "category")) {
                const fallbackRow: Record<string, unknown> = { ...row };
                delete fallbackRow.category;
                const fallback = await saveBeat(fallbackRow, "id,song_id,producer_id,producer_user_id,producer_name,title,cover_url,audio_url,storage_path,license,lease_price,exclusive_price,split_percentage,plays,likes,downloads,leases,payouts,created_at");
                data = fallback.data;
                error = fallback.error;
            }
            if (error) {
                console.error("[api/producers] beat save failed:", error);
                return jsonResponse({ error: getErrorMessage(error) }, 500);
            }
            return jsonResponse({ beat: data });
        }
        if (action === "update-beat") {
            const id = String(body.id || "").trim();
            if (!id)
                return jsonResponse({ error: "Beat id is required." }, 400);
            const updates: Record<string, unknown> = {};
            if (body.category !== undefined)
                updates.category = String(body.category || "").trim() || "Beats";
            if (body.license !== undefined)
                updates.license = normalizeLicense(body.license);
            if (body.leasePrice !== undefined)
                updates.lease_price = Math.max(0, Number(body.leasePrice) || 0);
            if (body.exclusivePrice !== undefined)
                updates.exclusive_price = Math.max(0, Number(body.exclusivePrice) || 0);
            if (body.splitPercentage !== undefined) {
                updates.split_percentage = Math.max(0, Math.min(100, Number(body.splitPercentage) || 0));
            }
            if (body.plays !== undefined)
                updates.plays = Math.max(0, Number(body.plays) || 0);
            if (body.likes !== undefined)
                updates.likes = Math.max(0, Number(body.likes) || 0);
            if (body.downloads !== undefined)
                updates.downloads = Math.max(0, Number(body.downloads) || 0);
            if (body.leases !== undefined)
                updates.leases = Math.max(0, Number(body.leases) || 0);
            if (body.payouts !== undefined)
                updates.payouts = Math.max(0, Number(body.payouts) || 0);
            if (Object.keys(updates).length === 0)
                return jsonResponse({ error: "No producer beat updates provided." }, 400);
            const updateBeat = async (beatUpdates: Record<string, unknown>, selectColumns: string) => supabase
                .from("producer_beats")
                .update(beatUpdates)
                .eq("id", id)
                .select(selectColumns)
                .single();
            const initialUpdate = await updateBeat(updates, "id,song_id,producer_id,producer_user_id,producer_name,title,category,cover_url,audio_url,storage_path,license,lease_price,exclusive_price,split_percentage,plays,likes,downloads,leases,payouts,created_at");
            let data = initialUpdate.data;
            let error = initialUpdate.error;
            if (error && isMissingColumnError(error, "category")) {
                const fallbackUpdates: Record<string, unknown> = { ...updates };
                delete fallbackUpdates.category;
                const fallback = await updateBeat(fallbackUpdates, "id,song_id,producer_id,producer_user_id,producer_name,title,cover_url,audio_url,storage_path,license,lease_price,exclusive_price,split_percentage,plays,likes,downloads,leases,payouts,created_at");
                data = fallback.data;
                error = fallback.error;
            }
            if (error) {
                console.error("[api/producers] beat update failed:", error);
                return jsonResponse({ error: getErrorMessage(error) }, 500);
            }
            return jsonResponse({ beat: data });
        }
        if (action === "delete-beat") {
            const id = String(body.id || "").trim();
            if (!id)
                return jsonResponse({ error: "Beat id is required." }, 400);
            const { error } = await supabase.from("producer_beats").delete().eq("id", id);
            if (error) {
                console.error("[api/producers] beat delete failed:", error);
                return jsonResponse({ error: getErrorMessage(error) }, 500);
            }
            return jsonResponse({ ok: true });
        }
        return jsonResponse({ error: "Unknown producer action." }, 400);
    }
    catch (error) {
        console.error("[api/producers] post server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
