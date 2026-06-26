/** DESKTOP ONLY — live session runtime for protected actions, profile display, and delete access. */

import type { Session, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { readAccessTokenFromSession } from "./desktop-auth-recovery-gate";
import { isOversizedBearerToken } from "./session-token-limits";
import {
    createDesktopAuthenticatedFetch,
} from "./desktop-authenticated-request-pipeline";

export type DesktopActionRuntimeConfig = {
    supabase: SupabaseClient;
    readAuthSession: () => Session | null;
};

export type DesktopProfileDisplayInput = {
    profileDisplayName?: string;
    user?: SupabaseUser | null;
    activeUser?: SupabaseUser | null;
    authSession?: Session | null;
    authEmail?: string;
};

export type DesktopActionIdentityInput = {
    accountUserId?: string;
    user?: SupabaseUser | null;
    activeUser?: SupabaseUser | null;
    authSession?: Session | null;
};

export type DesktopUploadDeleteAccessInput = {
    itemId: string;
    ownerUserId?: string;
    producerUserId?: string;
    producerProfileId?: string;
    artistProfileId?: string;
    artistName?: string;
    accountUserId: string;
    authSession?: Session | null;
    isPlatformOwner: boolean;
    currentProducerProfileId?: string;
    selectedArtistProfileId?: string;
    resolveArtistId?: (artistName: string) => string;
    isDatabaseUuid?: (value: string) => boolean;
};

function readUserIdFromAccessToken(accessToken: string) {
    try {
        const payload = accessToken.split(".")[1];
        if (!payload) {
            return "";
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const json = JSON.parse(atob(padded)) as { sub?: string };
        return String(json.sub || "").trim();
    }
    catch {
        return "";
    }
}

function readMetadataDisplayName(user: SupabaseUser | null | undefined) {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    if (!metadata) {
        return "";
    }
    return String(metadata.display_name
        || metadata.displayName
        || metadata.full_name
        || metadata.name
        || "").trim();
}

function readEmailLocalPart(email: string) {
    const trimmed = email.trim();
    if (!trimmed.includes("@")) {
        return trimmed;
    }
    return trimmed.split("@")[0] || "";
}

export function readDesktopActionBearerToken(session: Session | null | undefined) {
    const gated = readAccessTokenFromSession(session);
    if (gated) {
        return gated;
    }
    const raw = typeof session?.access_token === "string" ? session.access_token.trim() : "";
    if (!raw || isOversizedBearerToken(raw)) {
        return "";
    }
    if (!raw.startsWith("eyJ")) {
        return "";
    }
    return raw.split(".").length === 3 ? raw : "";
}

export function resolveDesktopActionUserId(input: DesktopActionIdentityInput = {}) {
    const direct = String(input.accountUserId || input.user?.id || input.activeUser?.id || "").trim();
    if (direct) {
        return direct;
    }
    const sessionUserId = String(input.authSession?.user?.id || "").trim();
    if (sessionUserId) {
        return sessionUserId;
    }
    const token = readDesktopActionBearerToken(input.authSession);
    if (token) {
        return readUserIdFromAccessToken(token);
    }
    return "";
}

export function hasUsableDesktopProtectedActionSession(session: Session | null | undefined) {
    if (!session) {
        return false;
    }
    if (session.user?.id) {
        return true;
    }
    if (readDesktopActionBearerToken(session)) {
        return true;
    }
    const refreshToken = session.refresh_token;
    return typeof refreshToken === "string" && refreshToken.trim().length > 0;
}

export function resolveDesktopProfileDisplayName(input: DesktopProfileDisplayInput = {}) {
    const profileName = String(input.profileDisplayName || "").trim();
    if (profileName) {
        return profileName;
    }
    const metadataName = readMetadataDisplayName(input.user)
        || readMetadataDisplayName(input.activeUser)
        || readMetadataDisplayName(input.authSession?.user);
    if (metadataName) {
        return metadataName;
    }
    const email = String(
        input.user?.email
        || input.activeUser?.email
        || input.authSession?.user?.email
        || input.authEmail
        || "",
    ).trim();
    const emailName = readEmailLocalPart(email);
    if (emailName) {
        return emailName;
    }
    return "";
}

export function canDeleteDesktopUploadedItem(input: DesktopUploadDeleteAccessInput) {
    const isUuid = input.isDatabaseUuid ?? ((value: string) => Boolean(value));
    if (!isUuid(input.itemId)) {
        return false;
    }
    if (input.isPlatformOwner) {
        return true;
    }
    const userId = resolveDesktopActionUserId({
        accountUserId: input.accountUserId,
        authSession: input.authSession,
    });
    const hasSessionAccess = hasUsableDesktopProtectedActionSession(input.authSession);
    if (!userId && !hasSessionAccess) {
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

export function createDesktopActionRuntime(config: DesktopActionRuntimeConfig) {
    const fetch = createDesktopAuthenticatedFetch({
        supabase: config.supabase,
        readAuthSession: config.readAuthSession,
    });

    return {
        fetch,
        readAuthSession: config.readAuthSession,
        readAccessToken: () => readDesktopActionBearerToken(config.readAuthSession()),
        resolveUserId: (input: DesktopActionIdentityInput = {}) => resolveDesktopActionUserId({
            ...input,
            authSession: input.authSession ?? config.readAuthSession(),
        }),
        resolveDisplayName: (input: DesktopProfileDisplayInput = {}) => resolveDesktopProfileDisplayName(input),
    };
}

export type DesktopActionRuntime = ReturnType<typeof createDesktopActionRuntime>;
export type { DesktopAuthenticatedFetch as DesktopProtectedActionFetch } from "./desktop-authenticated-request-pipeline";
