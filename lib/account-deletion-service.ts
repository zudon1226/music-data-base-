/**
 * Self-service account deletion (App Store / GDPR-oriented).
 * Deletes or anonymizes the authenticated user's data; never targets another user.
 * Financial: does not call Stripe. Payout rows use ON DELETE SET NULL (retained ledger).
 * Ringtone purchases with paid history: products are archived, not hard-deleted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUserId } from "@/lib/admin-auth";
import {
    cleanupPersistedMediaQueues,
    deleteOptionalLegacyMediaRows,
    deleteStorageObjectStrict,
    removeMediaFromUserMusicState,
} from "@/lib/media-delete-lifecycle";
import { deleteOrArchiveRingtoneProduct } from "@/lib/ringtone-delete-lifecycle";
import { getErrorMessage, isPlatformOwnerUserId, safeSelect } from "@/lib/server-supabase";

const SONGS_BUCKET = "songs";
const VIDEOS_BUCKET = "videos";

const USER_STORAGE_PREFIX_BUCKETS = [
    "avatars",
    "licenses",
    "downloads",
    "user-media-queues",
    "support-attachments",
    "ringtone-source",
    "ringtone-previews",
    "ringtone-downloads",
] as const;

export type AccountDeletionResult =
    | { ok: true; message: string; deletedUserId: string }
    | { ok: false; status: number; error: string; code: string };

function isMissingOptionalTable(error: unknown) {
    const code = error && typeof error === "object"
        ? String((error as Record<string, unknown>).code || "")
        : "";
    const message = getErrorMessage(error).toLowerCase();
    return code === "42P01" || code === "PGRST205" || message.includes("does not exist") || message.includes("schema cache");
}

async function deleteOptionalEq(supabase: SupabaseClient, table: string, column: string, value: string) {
    const { error } = await supabase.from(table).delete().eq(column, value);
    if (error && !isMissingOptionalTable(error)) throw error;
}

async function deleteOptionalTypedItemRows(
    supabase: SupabaseClient,
    tableName: string,
    itemId: string,
    itemType: string,
) {
    const { error } = await supabase.from(tableName).delete().eq("item_id", itemId).eq("item_type", itemType);
    if (error && !isMissingOptionalTable(error)) throw error;
}

async function deleteOwnedSong(supabase: SupabaseClient, userId: string, song: { id: string; storage_path?: string | null; audio_url?: string | null }) {
    const id = song.id;
    const { error: likesError } = await supabase.from("song_likes").delete().eq("song_id", id);
    if (likesError && !isMissingOptionalTable(likesError)) throw likesError;

    const relatedTables = ["favorites", "likes", "playlist_songs", "recent_plays", "queue", "streams"];
    await Promise.all([
        ...relatedTables.map((tableName) => deleteOptionalLegacyMediaRows(supabase, tableName, "song", id)),
        deleteOptionalTypedItemRows(supabase, "library_saves", id, "song"),
        deleteOptionalTypedItemRows(supabase, "playlist_items", id, "song"),
        deleteOptionalTypedItemRows(supabase, "album_items", id, "song"),
        deleteOptionalTypedItemRows(supabase, "album_tracks", id, "song"),
        deleteOptionalTypedItemRows(supabase, "comments", id, "song"),
        deleteOptionalTypedItemRows(supabase, "content_comments", id, "song"),
        deleteOptionalTypedItemRows(supabase, "moderation_reports", id, "song"),
    ]);
    await removeMediaFromUserMusicState(supabase, "song", id);
    await cleanupPersistedMediaQueues("song", id);
    const storagePath = String(song.storage_path || song.audio_url || "").trim();
    if (storagePath) {
        try {
            await deleteStorageObjectStrict(supabase, SONGS_BUCKET, storagePath);
        }
        catch (error) {
            console.warn("[account-deletion] song storage cleanup skipped", { userId, songId: id, error: getErrorMessage(error) });
        }
    }
    const { error: deleteError } = await supabase.from("songs").delete().eq("id", id).eq("user_id", userId);
    if (deleteError) throw deleteError;
}

async function deleteOwnedVideo(
    supabase: SupabaseClient,
    userId: string,
    video: { id: string; storage_path?: string | null; video_url?: string | null },
) {
    const id = video.id;
    await deleteOptionalEq(supabase, "video_likes", "video_id", id);
    const relatedTables = ["favorites", "likes", "playlist_songs", "recent_plays", "queue", "streams"];
    await Promise.all([
        ...relatedTables.map((tableName) => deleteOptionalLegacyMediaRows(supabase, tableName, "video", id)),
        deleteOptionalTypedItemRows(supabase, "library_saves", id, "video"),
        deleteOptionalTypedItemRows(supabase, "playlist_items", id, "video"),
        deleteOptionalTypedItemRows(supabase, "comments", id, "video"),
        deleteOptionalTypedItemRows(supabase, "content_comments", id, "video"),
        deleteOptionalTypedItemRows(supabase, "moderation_reports", id, "video"),
    ]);
    await removeMediaFromUserMusicState(supabase, "video", id);
    await cleanupPersistedMediaQueues("video", id);
    const storagePath = String(video.storage_path || video.video_url || "").trim();
    if (storagePath) {
        try {
            await deleteStorageObjectStrict(supabase, VIDEOS_BUCKET, storagePath);
        }
        catch (error) {
            console.warn("[account-deletion] video storage cleanup skipped", { userId, videoId: id, error: getErrorMessage(error) });
        }
    }
    const { error: deleteError } = await supabase.from("videos").delete().eq("id", id).eq("user_id", userId);
    if (deleteError) throw deleteError;
}

async function deleteUserSupportTickets(supabase: SupabaseClient, userId: string) {
    const tickets = await safeSelect<{ id: string; screenshot_path: string | null }>(
        supabase.from("support_tickets").select("id,screenshot_path").eq("user_id", userId),
    );
    for (const ticket of tickets) {
        const path = String(ticket.screenshot_path || "").trim();
        if (path) {
            await supabase.storage.from("support-attachments").remove([path]).catch(() => undefined);
        }
    }
    if (tickets.length > 0) {
        const ids = tickets.map((row) => row.id);
        await supabase.from("support_tickets").delete().in("id", ids);
    }
}

async function purgeUserStoragePrefixes(supabase: SupabaseClient, userId: string) {
    for (const bucket of USER_STORAGE_PREFIX_BUCKETS) {
        const listed = await supabase.storage.from(bucket).list(userId, { limit: 100 });
        if (listed.error || !listed.data?.length) continue;
        const paths = listed.data.map((entry) => `${userId}/${entry.name}`);
        if (paths.length > 0) {
            await supabase.storage.from(bucket).remove(paths).catch(() => undefined);
        }
    }
    for (const bucket of [SONGS_BUCKET, VIDEOS_BUCKET] as const) {
        const listed = await supabase.storage.from(bucket).list(userId, { limit: 100 });
        if (listed.error || !listed.data?.length) continue;
        const paths = listed.data.map((entry) => `${userId}/${entry.name}`);
        if (paths.length > 0) {
            await supabase.storage.from(bucket).remove(paths).catch(() => undefined);
        }
    }
}

/**
 * Retained financial rows: detach identity without Stripe API calls.
 * - payouts.user_id → SET NULL on auth delete (migration 202606070004)
 * - subscription_payments CASCADE with auth user (acceptable for self-service beta/TEST accounts)
 * - creator_payment_profiles CASCADE (Connect account id remains in Stripe; not modified here)
 */
async function detachRetainedFinancialRecords(supabase: SupabaseClient, userId: string) {
    const payouts = await safeSelect<{ id: string }>(
        supabase.from("payouts").select("id").eq("user_id", userId),
    );
    for (const payout of payouts) {
        await supabase
            .from("payouts")
            .update({
                metadata: {
                    account_deleted: true,
                    anonymized_at: new Date().toISOString(),
                },
            })
            .eq("id", payout.id);
    }
}

async function deleteOwnedRingtoneProducts(supabase: SupabaseClient, userId: string) {
    const products = await safeSelect<{ id: string }>(
        supabase.from("ringtone_products").select("id").eq("creator_id", userId),
    );
    for (const product of products) {
        const result = await deleteOrArchiveRingtoneProduct({
            ringtoneId: product.id,
            actorId: userId,
            isAdmin: false,
        });
        if (!result.ok) {
            console.warn("[account-deletion] ringtone cleanup", { ringtoneId: product.id, error: result.error });
        }
    }
}

export async function assertAccountDeletionAllowed(userId: string): Promise<AccountDeletionResult | { ok: true }> {
    if (await isPlatformOwnerUserId(userId)) {
        return {
            ok: false,
            status: 403,
            error: "This platform owner account cannot be deleted here.",
            code: "owner_protected",
        };
    }
    if (await isAdminUserId(userId)) {
        return {
            ok: false,
            status: 403,
            error: "Admin accounts must contact support to delete.",
            code: "admin_protected",
        };
    }
    return { ok: true };
}

export async function deleteAuthenticatedUserAccount(
    supabase: SupabaseClient,
    userId: string,
): Promise<AccountDeletionResult> {
    const allowed = await assertAccountDeletionAllowed(userId);
    if (!allowed.ok) return allowed;

    const authUser = await supabase.auth.admin.getUserById(userId);
    if (authUser.error || !authUser.data.user) {
        return { ok: false, status: 404, error: "Account not found.", code: "not_found" };
    }

    try {
        const songs = await safeSelect<{ id: string; storage_path: string | null; audio_url: string | null }>(
            supabase.from("songs").select("id,storage_path,audio_url").eq("user_id", userId),
        );
        for (const song of songs) {
            await deleteOwnedSong(supabase, userId, song);
        }

        const videos = await safeSelect<{ id: string; storage_path: string | null; video_url: string | null }>(
            supabase.from("videos").select("id,storage_path,video_url").eq("user_id", userId),
        );
        for (const video of videos) {
            await deleteOwnedVideo(supabase, userId, video);
        }

        const albums = await safeSelect<{ id: string }>(
            supabase.from("albums").select("id").eq("user_id", userId),
        );
        for (const album of albums) {
            await deleteOptionalEq(supabase, "album_items", "album_id", album.id);
            await deleteOptionalEq(supabase, "album_tracks", "album_id", album.id);
            await supabase.from("albums").delete().eq("id", album.id).eq("user_id", userId);
        }

        await deleteOwnedRingtoneProducts(supabase, userId);
        await deleteUserSupportTickets(supabase, userId);

        await deleteOptionalEq(supabase, "producer_beats", "producer_user_id", userId);
        await deleteOptionalEq(supabase, "artist_profiles", "user_id", userId);
        await deleteOptionalEq(supabase, "producer_profiles", "user_id", userId);
        await deleteOptionalEq(supabase, "podcast_shows", "user_id", userId);

        await detachRetainedFinancialRecords(supabase, userId);
        await purgeUserStoragePrefixes(supabase, userId);

        const deleteAuth = await supabase.auth.admin.deleteUser(userId);
        if (deleteAuth.error) {
            return {
                ok: false,
                status: 500,
                error: "Could not complete account deletion.",
                code: "auth_delete_failed",
            };
        }

        return {
            ok: true,
            message: "Your account has been deleted.",
            deletedUserId: userId,
        };
    }
    catch (error) {
        console.error("[account-deletion] failed:", error);
        return {
            ok: false,
            status: 500,
            error: "Could not delete your account. Try again or contact support.",
            code: "deletion_failed",
        };
    }
}
