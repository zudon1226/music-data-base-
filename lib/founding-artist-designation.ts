/**
 * Founding Artist designation — recognition only (not a role, not founding_members onboarding).
 */

import { normalizeResolvedAccountRole } from "@/lib/resolved-account-role";
import type { SupabaseClient } from "@supabase/supabase-js";

export const FOUNDING_ARTIST_BADGE_LABEL = "Founding Artist";

export function isEligibleAccountTypeForFoundingArtistDesignation(accountType: unknown) {
    const normalized = String(accountType || "").trim().toLowerCase();
    return normalized === "artist"
        || normalized === "artist_pro"
        || normalized === "founding_artist";
}

export function canReceiveFoundingArtistDesignation(accountType: unknown) {
    if (!isEligibleAccountTypeForFoundingArtistDesignation(accountType)) {
        return false;
    }
    return normalizeResolvedAccountRole(accountType) === "artist";
}

export type FoundingArtistListItem = {
    userId: string;
    displayName: string;
    username: string;
    avatarUrl: string;
    accountType: string;
    foundingArtistSince: string | null;
};

export async function listFoundingArtistsForDiscovery(
    supabase: SupabaseClient,
    limit = 24,
): Promise<FoundingArtistListItem[]> {
    const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,display_name,username,avatar_url,account_type,founding_artist_since")
        .eq("is_founding_artist", true)
        .in("account_type", ["artist", "artist_pro", "founding_artist"])
        .order("founding_artist_since", { ascending: false, nullsFirst: false })
        .limit(limit);

    if (error) {
        throw error;
    }

    return (data || []).map((row) => {
        const record = row as Record<string, unknown>;
        const userId = String(record.user_id || record.id || "").trim();
        return {
            userId,
            displayName: String(record.display_name || record.username || "Artist").trim(),
            username: String(record.username || "").trim(),
            avatarUrl: String(record.avatar_url || "").trim(),
            accountType: String(record.account_type || "artist").trim(),
            foundingArtistSince: record.founding_artist_since
                ? String(record.founding_artist_since)
                : null,
        };
    }).filter((item) => item.userId);
}

export async function loadFoundingArtistFlagForUser(
    supabase: SupabaseClient,
    userId: string,
): Promise<boolean> {
    if (!userId) return false;
    const { data } = await supabase
        .from("profiles")
        .select("is_founding_artist,account_type")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();
    const row = (data || {}) as Record<string, unknown>;
    if (!canReceiveFoundingArtistDesignation(row.account_type)) {
        return false;
    }
    return Boolean(row.is_founding_artist);
}

export async function setFoundingArtistDesignation(input: {
    supabase: SupabaseClient;
    targetUserId: string;
    grant: boolean;
}) {
    const { data: profile, error: loadError } = await input.supabase
        .from("profiles")
        .select("id,user_id,account_type,display_name,is_founding_artist")
        .or(`id.eq.${input.targetUserId},user_id.eq.${input.targetUserId}`)
        .maybeSingle();

    if (loadError) {
        return { ok: false as const, error: loadError.message };
    }
    if (!profile) {
        return { ok: false as const, error: "Profile not found.", status: 404 as const };
    }

    const row = profile as Record<string, unknown>;
    const accountType = String(row.account_type || "");
    if (!canReceiveFoundingArtistDesignation(accountType)) {
        return {
            ok: false as const,
            error: "Only Artist accounts can receive Founding Artist designation.",
            status: 400 as const,
        };
    }

    const profileKey = String(row.user_id || row.id || input.targetUserId);
    const patch = input.grant
        ? { is_founding_artist: true, founding_artist_since: new Date().toISOString() }
        : { is_founding_artist: false, founding_artist_since: null };

    const { data: updated, error: updateError } = await input.supabase
        .from("profiles")
        .update(patch)
        .or(`id.eq.${profileKey},user_id.eq.${profileKey}`)
        .select("user_id,account_type,is_founding_artist,founding_artist_since,display_name")
        .maybeSingle();

    if (updateError) {
        return { ok: false as const, error: updateError.message };
    }

    return { ok: true as const, profile: updated };
}
