/** DESKTOP ONLY — backward-compatible exports for the desktop action runtime. */

export {
    canDeleteDesktopUploadedItem,
    createDesktopActionRuntime,
    readDesktopActionBearerToken,
    resolveDesktopActionUserId,
    resolveDesktopProfileDisplayName,
    type DesktopActionRuntime,
    type DesktopProtectedActionFetch,
} from "./desktop-action-runtime";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createDesktopActionRuntime } from "./desktop-action-runtime";

export function createDesktopProtectedActionFetch(
    supabase: SupabaseClient,
    readAuthSession: () => Session | null,
) {
    return createDesktopActionRuntime({
        supabase,
        readAuthSession,
    }).fetch;
}
