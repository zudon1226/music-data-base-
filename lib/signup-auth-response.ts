/**
 * Sign-up UX helpers for Supabase Auth responses when email confirmation is enabled.
 * GoTrue may return HTTP 200 with no session for both new signups and repeated signups
 * (user_repeated_signup); never treat "no session" as proof a new account was created.
 */

export type SignUpNoSessionClassification = "likely_pending_confirmation" | "likely_existing_account";

export type SignUpUserSnapshot = {
    email_confirmed_at?: string | null;
    identities?: ReadonlyArray<{ id?: string }> | null;
} | null | undefined;

export type SignUpNoSessionMessageInput = {
    classification: SignUpNoSessionClassification;
    signupAccountType: string;
    creatorSelfSignupEnabled: boolean;
    foundingBetaLocked: boolean;
    hasPendingInviteCode: boolean;
};

const LOGIN_BELOW_HINT = " If you already have an account, use Log in below.";

/** Best-effort signal only — Supabase may return an obfuscated user for duplicates. */
export function classifySignUpWithoutSession(user: SignUpUserSnapshot): SignUpNoSessionClassification {
    if (!user) {
        return "likely_existing_account";
    }
    if (user.email_confirmed_at) {
        return "likely_existing_account";
    }
    const identities = user.identities;
    if (Array.isArray(identities) && identities.length === 0) {
        return "likely_existing_account";
    }
    return "likely_pending_confirmation";
}

export function buildSignUpNoSessionMessage(input: SignUpNoSessionMessageInput): string {
    if (input.classification === "likely_existing_account") {
        return "This email may already be registered. Log in below, or check your inbox if you still need to confirm your email.";
    }

    const selfServeCreator = input.creatorSelfSignupEnabled
        && (input.signupAccountType === "artist"
            || input.signupAccountType === "producer"
            || input.signupAccountType === "artist_producer");

    if (selfServeCreator) {
        return `If this is a new email address, check your inbox for a confirmation link, then log in to activate your creator dashboard.${LOGIN_BELOW_HINT}`;
    }

    if (input.foundingBetaLocked && input.hasPendingInviteCode) {
        return `If this is a new email address, check your inbox for a confirmation link, then log in to finish invite redemption and account activation.${LOGIN_BELOW_HINT}`;
    }

    return `If this is a new email address, check your inbox for a confirmation link, then log in.${LOGIN_BELOW_HINT}`;
}

export function resolveSignUpClientErrorMessage(error: { message?: string } | null | undefined): string {
    const message = typeof error?.message === "string" ? error.message.trim() : "";
    return message || "Sign up failed. Please try again.";
}

export function resolveAuthTransportErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        if (error.message === "Failed to fetch") {
            return "Could not reach Supabase. Check your Supabase URL, anon key, internet connection, and allowed site URL settings.";
        }
        return error.message;
    }
    return "Something went wrong while connecting to Supabase. Please try again.";
}
