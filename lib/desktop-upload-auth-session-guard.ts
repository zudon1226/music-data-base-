/** DESKTOP ONLY — block Supabase auth mutations while a video upload is active. */

import { isDesktopVideoUploadLifecycleActive } from "./desktop-video-upload-lifecycle";

export function shouldBlockDesktopSupabaseAuthMutation() {
    return isDesktopVideoUploadLifecycleActive();
}

/**
 * Run refreshSession only when no desktop video upload is in progress.
 * Prevents refresh-token reuse during pinned-session uploads.
 */
export async function refreshDesktopSupabaseSessionWhenSafe(
    refresh: () => Promise<unknown>,
) {
    if (shouldBlockDesktopSupabaseAuthMutation()) {
        return;
    }
    await refresh().catch(() => undefined);
}
