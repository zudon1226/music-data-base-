import { createSupportAuthenticatedClient } from "@/lib/support-authenticated-client";

/** User-scoped Supabase client for RLS-protected trust tables (blocks, hidden content). */
export function createTrustAuthenticatedClient(accessToken: string) {
    return createSupportAuthenticatedClient(accessToken);
}
