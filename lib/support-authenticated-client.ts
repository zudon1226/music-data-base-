import { createClient } from "@supabase/supabase-js";
import { readSupabaseLibraryApiKey, readSupabaseProjectUrl } from "@/lib/supabase-config";

export function createSupportAuthenticatedClient(accessToken: string) {
    return createClient(readSupabaseProjectUrl(), readSupabaseLibraryApiKey(), {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
}
