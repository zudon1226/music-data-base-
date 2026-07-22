import {
    assertSafeAuthUserMetadata,
    authMetadataNeedsRepair,
    buildAuthUserMetadataAdminPatch,
    sanitizeAuthUserMetadata,
} from "@/lib/auth-user-metadata";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileRow = {
    display_name: string | null;
    account_type: string | null;
    avatar_url: string | null;
};

function normalizeRole(value: unknown) {
    const cleanValue = String(value || "").trim().toLowerCase();
    if (
        cleanValue === "admin"
        || cleanValue === "producer"
        || cleanValue === "artist"
        || cleanValue === "founding_artist"
        || cleanValue === "founding_producer"
        || cleanValue === "artist_pro"
        || cleanValue === "producer_pro"
        || cleanValue === "creator_free"
        || cleanValue === "creator"
    ) {
        return cleanValue;
    }
    return "listener";
}

async function loadProfileRow(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from("profiles")
        .select("display_name,account_type,avatar_url")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();
    return (data || null) as ProfileRow | null;
}

export async function ensureProfileRow(
    supabase: SupabaseClient,
    userId: string,
    patch: {
        displayName?: string;
        role?: string;
        avatarUrl?: string;
        requestedAccountType?: string;
    } = {},
) {
    const userResult = await supabase.auth.admin.getUserById(userId);
    const email = userResult.data.user?.email || "";
    const metadata = (userResult.data.user?.user_metadata || {}) as Record<string, unknown>;
    const existing = await loadProfileRow(supabase, userId);
    const displayName = patch.displayName
        || existing?.display_name
        || String(metadata.displayName || metadata.display_name || "").trim()
        || email.split("@")[0]
        || "Music Data Base user";
    // profiles.account_type is authoritative. Never promote from auth metadata
    // (stale founding_artist / invite leftovers must not rewrite Listener profiles).
    const role = normalizeRole(patch.role || existing?.account_type || "listener");
    const avatarUrl = patch.avatarUrl || existing?.avatar_url || String(metadata.avatarUrl || metadata.avatar_url || "").trim();

    await supabase.from("profiles").upsert({
        id: userId,
        user_id: userId,
        display_name: displayName,
        account_type: role,
        avatar_url: avatarUrl || null,
        updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    return { displayName, role, avatarUrl };
}

export async function repairAuthUserMetadata(
    supabase: SupabaseClient,
    userId: string,
    patch: {
        displayName?: string;
        role?: string;
        avatarUrl?: string;
        requestedAccountType?: string;
    } = {},
) {
    const userResult = await supabase.auth.admin.getUserById(userId);
    const currentMetadata = (userResult.data.user?.user_metadata || {}) as Record<string, unknown>;
    const profileFields = await ensureProfileRow(supabase, userId, patch);
    const nextMetadata = assertSafeAuthUserMetadata({
        displayName: patch.displayName || profileFields.displayName,
        role: patch.role || profileFields.role,
        avatarUrl: patch.avatarUrl || profileFields.avatarUrl,
        requestedAccountType: patch.requestedAccountType
            || String(currentMetadata.requestedAccountType || currentMetadata.requested_account_type || "").trim()
            || undefined,
    });

    const comparableCurrent = sanitizeAuthUserMetadata(currentMetadata);
    const metadataChanged = authMetadataNeedsRepair(currentMetadata)
        || JSON.stringify(comparableCurrent) !== JSON.stringify(nextMetadata);

    if (!metadataChanged) {
        return {
            repaired: false,
            metadataChanged: false,
            userMetadata: nextMetadata,
        };
    }

    const adminPatch = buildAuthUserMetadataAdminPatch(currentMetadata, nextMetadata);
    const { error } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: adminPatch,
    });
    if (error) {
        throw error;
    }

    return {
        repaired: true,
        metadataChanged: true,
        userMetadata: nextMetadata,
    };
}
