import { hasSignupAccountTypeMarkerPrefix } from "@/lib/signup-account-type";

export const FOUNDING_PROFILE_MARKER_SOCIAL_LINK_FORBIDDEN_MESSAGE =
    "Social link cannot include signup account-type markers.";

export const FOUNDING_PROFILE_MARKER_SOCIAL_LINK_LOCKED_MESSAGE =
    "Signup account type is locked; update display name or profile image only.";

/** Apply founding cohort profile PATCH fields without clobbering protected signup markers. */
export function buildFoundingMemberProfilePatchPayload(options: {
    existingSocialLink: string | null | undefined;
    displayName?: unknown;
    socialLink?: unknown;
    profileImageUrl?: unknown;
    now?: string;
}) {
    const now = options.now || new Date().toISOString();
    const updatePayload: Record<string, unknown> = { updated_at: now };
    const existingSocialLink = String(options.existingSocialLink || "").trim();
    const markerLocked = hasSignupAccountTypeMarkerPrefix(existingSocialLink);

    if (typeof options.displayName === "string") {
        updatePayload.display_name = options.displayName.trim();
    }
    if (typeof options.profileImageUrl === "string") {
        updatePayload.profile_image_url = options.profileImageUrl.trim();
    }

    if (typeof options.socialLink === "string") {
        const nextSocialLink = options.socialLink.trim();
        if (hasSignupAccountTypeMarkerPrefix(nextSocialLink)) {
            return {
                ok: false as const,
                status: 400 as const,
                error: FOUNDING_PROFILE_MARKER_SOCIAL_LINK_FORBIDDEN_MESSAGE,
            };
        }
        if (markerLocked) {
            return {
                ok: false as const,
                status: 400 as const,
                error: FOUNDING_PROFILE_MARKER_SOCIAL_LINK_LOCKED_MESSAGE,
            };
        }
        updatePayload.social_link = nextSocialLink;
    }

    return { ok: true as const, updatePayload, markerLocked };
}
