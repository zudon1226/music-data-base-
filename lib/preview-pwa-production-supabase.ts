function parseEnabledFlag(value: string | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

/**
 * Preview-only: authenticate and load user data from the production Supabase project
 * (for Microsoft Store / PWA QA on a Vercel Preview host). Never valid on Production deploys.
 */
export function previewPwaProductionSupabaseRequested(): boolean {
    return (
        parseEnabledFlag(process.env.MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE)
        || parseEnabledFlag(process.env.NEXT_PUBLIC_MDB_PREVIEW_PWA_USE_PRODUCTION_SUPABASE)
    );
}
