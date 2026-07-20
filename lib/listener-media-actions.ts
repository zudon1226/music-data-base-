/**
 * Listener media-card action resolver and shared role-warning copy.
 * Creator/owner controls must not render for Listener accounts.
 */

import { LISTENER_ACCESSIBLE_VIEWS } from "@/lib/role-based-navigation";

/** Shown only for genuinely unauthorized creator/admin destinations. */
export const ACCOUNT_ROLE_UNAVAILABLE_MESSAGE =
    "This area is not available for your account role.";

/** Creator workspace destinations that Listeners must never open. */
export const CREATOR_ONLY_NAV_VIEWS = [
    "Artist Dashboard",
    "Producer Dashboard",
    "Artist Profile",
    "Producer Profile",
    "My Ringtones",
    "Sales",
    "Platform Control Center",
] as const;

export type ListenerMediaActionCapabilityInput = {
    canUpload: boolean;
    isPlatformOwner?: boolean;
};

/** True when Edit / Delete / Archive / Publish / Claim / moderation owner tools may render. */
export function canRenderCreatorMediaControls(
    input: ListenerMediaActionCapabilityInput,
): boolean {
    return Boolean(input.isPlatformOwner || input.canUpload);
}

/**
 * Delete is ownership-gated AND creator-capability-gated.
 * Listeners never see Delete even if legacy ownership rows match.
 */
export function resolveListenerMediaCardCanDelete(input: {
    ownershipAllowsDelete: boolean;
    canUpload: boolean;
    isPlatformOwner?: boolean;
}): boolean {
    if (!canRenderCreatorMediaControls(input)) {
        return false;
    }
    return Boolean(input.ownershipAllowsDelete);
}

/** Copyright Claim is a creator/ownership control — never for Listener cards. */
export function resolveListenerMediaCardCanClaim(input: ListenerMediaActionCapabilityInput): boolean {
    return canRenderCreatorMediaControls(input);
}

export function isListenerAccessibleNavView(view: string): boolean {
    return (LISTENER_ACCESSIBLE_VIEWS as readonly string[]).includes(view);
}

export function isCreatorOnlyNavView(view: string): boolean {
    return (CREATOR_ONLY_NAV_VIEWS as readonly string[]).includes(view);
}

/** Stable Listener primary action order (labels may be compact). */
export const LISTENER_MEDIA_PRIMARY_ACTION_ORDER = [
    "play",
    "like",
    "follow",
    "save",
    "playlist",
    "queue",
    "download",
] as const;

/** Stable Listener secondary action order. */
export const LISTENER_MEDIA_SECONDARY_ACTION_ORDER = [
    "comments",
    "share",
    "report",
] as const;
