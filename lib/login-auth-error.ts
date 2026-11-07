import { describeSupabaseRuntimeIdentity } from "./supabase-config";

const INVALID_LOGIN_PATTERNS = [
    "invalid login credentials",
    "invalid email or password",
];

export function resolveSignInClientErrorMessage(error: { message?: string } | null | undefined): string {
    const message = typeof error?.message === "string" ? error.message.trim() : "";
    const normalized = message.toLowerCase();
    if (INVALID_LOGIN_PATTERNS.some((part) => normalized.includes(part))) {
        const { mode, deploymentTier, previewStagingEnabled } = describeSupabaseRuntimeIdentity();
        if (mode === "preview-staging" || (deploymentTier === "preview" && previewStagingEnabled)) {
            return [
                "This installed Preview app is connected to the Music Data Base staging database, not your live production account.",
                "Your existing account password applies only after you install the PWA from https://www.digitalmusicdatabase.com, or when Preview is configured for production sign-in.",
            ].join(" ");
        }
    }
    return message || "Log in failed. Please try again.";
}
