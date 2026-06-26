/** DESKTOP ONLY — session-bound protected action client factory and upload delete access helpers. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readAccessTokenFromSession } from "./desktop-auth-recovery-gate";
import {
    createDesktopProtectedActionClient,
    type DesktopProtectedActionFetch,
} from "./desktop-protected-action-client";

export function resolveDesktopActionUserId(accountUserId: string, sessionUserId = "") {
    return String(accountUserId || sessionUserId || "").trim();
}

export function createDesktopProtectedActionFetch(
    supabase: SupabaseClient,
    authSession: Session | null,
): DesktopProtectedActionFetch {
    return createDesktopProtectedActionClient({
        supabase,
        readAccessToken: () => readAccessTokenFromSession(authSession),
    });
}

type DesktopUploadDeleteAccessInput = {
    itemId: string;
    ownerUserId?: string;
    producerUserId?: string;
    producerProfileId?: string;
    artistProfileId?: string;
    artistName?: string;
    accountUserId: string;
    isAuthenticated: boolean;
    isPlatformOwner: boolean;
    currentProducerProfileId?: string;
    selectedArtistProfileId?: string;
    resolveArtistId?: (artistName: string) => string;
    isDatabaseUuid?: (value: string) => boolean;
};

export function canDeleteDesktopUploadedItem(input: DesktopUploadDeleteAccessInput) {
    const isUuid = input.isDatabaseUuid ?? ((value: string) => Boolean(value));
    if (!isUuid(input.itemId)) {
        return false;
    }
    if (input.isPlatformOwner) {
        return true;
    }
    const userId = resolveDesktopActionUserId(input.accountUserId);
    if (!userId && !input.isAuthenticated) {
        return false;
    }
    if (userId && input.ownerUserId && input.ownerUserId === userId) {
        return true;
    }
    if (userId && input.producerUserId && input.producerUserId === userId) {
        return true;
    }
    if (input.currentProducerProfileId && input.producerProfileId === input.currentProducerProfileId) {
        return true;
    }
    if (input.selectedArtistProfileId && input.artistProfileId === input.selectedArtistProfileId) {
        return true;
    }
    if (input.selectedArtistProfileId && input.artistName && input.resolveArtistId) {
        return input.resolveArtistId(input.artistName) === input.selectedArtistProfileId;
    }
    return false;
}
