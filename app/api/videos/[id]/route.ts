import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isPlatformOwnerUserId } from "@/lib/server-supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const VIDEOS_BUCKET = "videos";
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
function isMissingVideoLikesTableError(error: unknown) {
    if (!error || typeof error !== "object")
        return false;
    const record = error as Record<string, unknown>;
    const code = String(record.code || "");
    const message = String(record.message || record.error || "").toLowerCase();
    return code === "42P01" || message.includes("video_likes") || message.includes("does not exist");
}
function isMissingOptionalTableError(error: unknown, tableName: string) {
    const message = getErrorMessage(error).toLowerCase();
    const code = error && typeof error === "object" ? String((error as Record<string, unknown>).code || "") : "";
    return code === "42P01" || code === "PGRST205" || message.includes(tableName) || message.includes("does not exist") || message.includes("schema cache");
}
function getVideoLikesSetupMessage() {
    return "Video likes are not ready yet. Run the video_likes SQL migration in Supabase, then refresh.";
}
function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
async function syncVideoLikeCount(supabase: ReturnType<typeof getSupabaseServerClient>, videoId: string) {
    const { count, error: countError } = await supabase
        .from("video_likes")
        .select("id", { count: "exact", head: true })
        .eq("video_id", videoId);
    if (countError) {
        if (isMissingVideoLikesTableError(countError)) {
            throw new Error(getVideoLikesSetupMessage());
        }
        throw countError;
    }
    const likes = count || 0;
    const { error: updateError } = await supabase.from("videos").update({ likes }).eq("id", videoId);
    if (updateError) {
        throw updateError;
    }
    return likes;
}
export async function PATCH(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        const body = (await request.json().catch(() => ({}))) as {
            like?: unknown;
            likes?: unknown;
            userId?: unknown;
            views?: unknown;
            title?: unknown;
            description?: unknown;
            artist_name?: unknown;
            artist_id?: unknown;
            category?: unknown;
            cover_url?: unknown;
            thumbnail_url?: unknown;
            producer?: unknown;
            producer_name?: unknown;
            producer_id?: unknown;
            producerId?: unknown;
            producer_profile_id?: unknown;
            producerProfileId?: unknown;
            beat_id?: unknown;
            beatId?: unknown;
            video_codec?: unknown;
            videoCodec?: unknown;
            audio_codec?: unknown;
            audioCodec?: unknown;
            mobile_compatible?: unknown;
            mobileCompatible?: unknown;
        };
        const updates: {
            views?: number;
            title?: string;
            description?: string;
            artist_name?: string;
            artist_id?: string | null;
            category?: string;
            cover_url?: string;
            thumbnail_url?: string;
            producer?: string;
            producer_name?: string;
            producer_id?: string | null;
            producer_profile_id?: string | null;
            beat_id?: string | null;
            video_codec?: string | null;
            audio_codec?: string | null;
            mobile_compatible?: boolean | null;
        } = {};
        if (!id) {
            return jsonResponse({ error: "Missing video id." }, 400);
        }
        const supabase = getSupabaseServerClient();
        if (body.like === true || body.like === false) {
            const userId = typeof body.userId === "string" ? body.userId.trim() : "";
            if (!userId) {
                return jsonResponse({ error: body.like ? "Log in before liking videos." : "Log in before unliking videos." }, 401);
            }
            if (!isUuid(userId)) {
                return jsonResponse({ error: "Invalid user id for video like." }, 400);
            }
            if (body.like === false) {
                const { error: unlikeError } = await supabase
                    .from("video_likes")
                    .delete()
                    .eq("video_id", id)
                    .eq("user_id", userId);
                if (unlikeError) {
                    if (isMissingVideoLikesTableError(unlikeError)) {
                        return jsonResponse({ error: getVideoLikesSetupMessage() }, 500);
                    }
                    console.error("[api/videos/:id] unlike failed:", unlikeError);
                    return jsonResponse({ error: getErrorMessage(unlikeError) }, 500);
                }
                const likes = await syncVideoLikeCount(supabase, id);
                return jsonResponse({ ok: true, likedByUser: false, likes });
            }
            const { error: likeError } = await supabase.from("video_likes").insert({
                video_id: id,
                user_id: userId,
            });
            const duplicateLike = likeError &&
                (likeError.code === "23505" ||
                    String(likeError.message || "").toLowerCase().includes("duplicate") ||
                    String(likeError.message || "").toLowerCase().includes("unique"));
            if (likeError && !duplicateLike) {
                if (isMissingVideoLikesTableError(likeError)) {
                    return jsonResponse({ error: getVideoLikesSetupMessage() }, 500);
                }
                console.error("[api/videos/:id] like insert failed:", likeError);
                return jsonResponse({ error: getErrorMessage(likeError) }, 500);
            }
            const likes = await syncVideoLikeCount(supabase, id);
            return jsonResponse({ ok: true, likedByUser: true, duplicateLike: Boolean(duplicateLike), likes });
        }
        if (body.views !== undefined) {
            const views = Number(body.views);
            if (!Number.isFinite(views) || views < 0) {
                return jsonResponse({ error: "Invalid views value." }, 400);
            }
            updates.views = views;
        }
        if (body.likes !== undefined) {
            return jsonResponse({ error: "Use the heart button like action instead of setting raw likes." }, 400);
        }
        if (typeof body.title === "string") {
            updates.title = body.title.trim() || "Untitled video";
        }
        if (typeof body.description === "string") {
            updates.description = body.description.trim();
        }
        if (typeof body.artist_name === "string") {
            updates.artist_name = body.artist_name.trim();
        }
        if (body.artist_id !== undefined) {
            updates.artist_id = String(body.artist_id || "").trim() || null;
        }
        if (typeof body.category === "string") {
            updates.category = body.category.trim() || "Music Video";
        }
        if (typeof body.thumbnail_url === "string") {
            updates.thumbnail_url = body.thumbnail_url.trim();
        }
        if (typeof body.cover_url === "string") {
            updates.cover_url = body.cover_url.trim();
        }
        if (body.producer !== undefined) {
            updates.producer = String(body.producer || "").trim();
        }
        if (body.producer_name !== undefined) {
            updates.producer_name = String(body.producer_name || "").trim();
        }
        if (body.producer_id !== undefined || body.producerId !== undefined) {
            updates.producer_id = String(body.producer_id || body.producerId || "").trim() || null;
        }
        if (body.producer_profile_id !== undefined || body.producerProfileId !== undefined) {
            updates.producer_profile_id = String(body.producer_profile_id || body.producerProfileId || "").trim() || null;
        }
        if (body.beat_id !== undefined || body.beatId !== undefined) {
            updates.beat_id = String(body.beat_id || body.beatId || "").trim() || null;
        }
        if (body.video_codec !== undefined || body.videoCodec !== undefined) {
            updates.video_codec = String(body.video_codec || body.videoCodec || "").trim() || null;
        }
        if (body.audio_codec !== undefined || body.audioCodec !== undefined) {
            updates.audio_codec = String(body.audio_codec || body.audioCodec || "").trim() || null;
        }
        if (body.mobile_compatible !== undefined || body.mobileCompatible !== undefined) {
            const rawMobileCompatible = body.mobile_compatible ?? body.mobileCompatible;
            updates.mobile_compatible = typeof rawMobileCompatible === "boolean" ? rawMobileCompatible : null;
        }
        if (Object.keys(updates).length === 0) {
            return jsonResponse({ error: "No video updates provided." }, 400);
        }
        const { error } = await supabase.from("videos").update(updates).eq("id", id);
        if (error) {
            if (/video_codec|audio_codec|mobile_compatible/i.test(getErrorMessage(error))) {
                const legacyUpdates = { ...updates };
                delete legacyUpdates.video_codec;
                delete legacyUpdates.audio_codec;
                delete legacyUpdates.mobile_compatible;
                if (Object.keys(legacyUpdates).length === 0) {
                    return jsonResponse({ ok: true, compatibilitySkipped: true });
                }
                const legacyResult = await supabase.from("videos").update(legacyUpdates).eq("id", id);
                if (!legacyResult.error) {
                    return jsonResponse({ ok: true, compatibilitySkipped: true });
                }
            }
            console.error("[api/videos/:id] update failed:", error);
            return jsonResponse({ error: getErrorMessage(error) }, 500);
        }
        return jsonResponse({ ok: true });
    }
    catch (error) {
        console.error("[api/videos/:id] patch server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
async function deleteOptionalVideoRows(supabase: ReturnType<typeof getSupabaseServerClient>, tableName: string, videoId: string) {
    const { error } = await supabase.from(tableName).delete().eq("video_id", videoId);
    if (error && !isMissingOptionalTableError(error, tableName)) {
        throw error;
    }
}
async function deleteOptionalTypedItemRows(supabase: ReturnType<typeof getSupabaseServerClient>, tableName: string, itemId: string, itemType: string) {
    const { error } = await supabase.from(tableName).delete().eq("item_id", itemId).eq("item_type", itemType);
    if (error && !isMissingOptionalTableError(error, tableName)) {
        throw error;
    }
}
async function isProducerProfileOwner(supabase: ReturnType<typeof getSupabaseServerClient>, profileIds: string[], userId: string) {
    const cleanProfileIds = profileIds.filter((profileId) => profileId.trim());
    if (cleanProfileIds.length === 0)
        return false;
    const { data, error } = await supabase
        .from("producer_profiles")
        .select("id,user_id")
        .in("id", cleanProfileIds)
        .eq("user_id", userId)
        .limit(1);
    if (error) {
        if (isMissingOptionalTableError(error, "producer_profiles"))
            return false;
        throw error;
    }
    return Boolean(data?.length);
}
export async function DELETE(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { id } = await params;
        if (!id) {
            return jsonResponse({ error: "Missing video id." }, 400);
        }
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Log in before deleting uploaded videos." }, 401);
        }
        const isOwnerAdmin = await isPlatformOwnerUserId(userId);
        const supabase = getSupabaseServerClient();
        if (!isUuid(id)) {
            if (!isOwnerAdmin || !id.startsWith("storage-")) {
                return jsonResponse({ error: "Video delete requires a real database row id." }, 400);
            }
            const storagePath = id.replace(/^storage-/, "").trim();
            if (!storagePath) {
                return jsonResponse({ error: "Recovered video storage path is missing." }, 400);
            }
            const { error: storageDeleteError } = await supabase.storage.from(VIDEOS_BUCKET).remove([storagePath]);
            if (storageDeleteError) {
                console.error("[api/videos/:id] recovered storage delete failed:", storageDeleteError);
                return jsonResponse({ error: getErrorMessage(storageDeleteError) }, 500);
            }
            return jsonResponse({ ok: true, storageOnly: true });
        }
        const { data: video, error: readError } = await supabase
            .from("videos")
            .select("storage_path,user_id,artist_id,producer_id,producer_profile_id")
            .eq("id", id)
            .maybeSingle();
        if (readError) {
            console.error("[api/videos/:id] read before delete failed:", readError);
            return jsonResponse({ error: getErrorMessage(readError) }, 500);
        }
        if (!video) {
            return jsonResponse({ ok: true, alreadyDeleted: true });
        }
        const ownedByUser = video.user_id === userId || video.artist_id === userId || video.producer_id === userId || video.producer_profile_id === userId;
        const ownedProducerProfile = !ownedByUser && await isProducerProfileOwner(supabase, [String(video.producer_id || ""), String(video.producer_profile_id || "")], userId);
        if (!isOwnerAdmin && !ownedByUser && !ownedProducerProfile) {
            return jsonResponse({ error: "Only the uploader can delete this video." }, 403);
        }
        try {
            await Promise.all([
                deleteOptionalVideoRows(supabase, "video_likes", id),
                deleteOptionalVideoRows(supabase, "recent_videos", id),
                deleteOptionalTypedItemRows(supabase, "library_saves", id, "video"),
                deleteOptionalTypedItemRows(supabase, "playlist_items", id, "video"),
                deleteOptionalTypedItemRows(supabase, "comments", id, "video"),
                deleteOptionalTypedItemRows(supabase, "moderation_reports", id, "video"),
            ]);
        }
        catch (relatedDeleteError) {
            console.error("[api/videos/:id] related records delete failed:", relatedDeleteError);
            return jsonResponse({ error: getErrorMessage(relatedDeleteError) }, 500);
        }
        const { error: deleteError } = await supabase.from("videos").delete().eq("id", id);
        if (deleteError) {
            console.error("[api/videos/:id] delete failed:", deleteError);
            return jsonResponse({ error: getErrorMessage(deleteError) }, 500);
        }
        if (video?.storage_path) {
            const { error: storageError } = await supabase.storage.from(VIDEOS_BUCKET).remove([video.storage_path]);
            if (storageError) {
            }
        }
        return jsonResponse({ ok: true });
    }
    catch (error) {
        console.error("[api/videos/:id] delete server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
