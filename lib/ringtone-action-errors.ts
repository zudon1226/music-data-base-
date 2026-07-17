/**
 * Public-safe ringtone action errors (never expose SQL/table details to clients).
 */

import { getErrorMessage } from "@/lib/server-supabase";

export const RINGTONE_ACTION_FAILED_MESSAGE = "The ringtone action could not be completed.";
export const RINGTONE_ACTION_FAILED_CODE = "ACTION_FAILED";

const UNSAFE_ERROR_PATTERN =
    /ringtone_moderation_logs|ringtone_products|ringtone_revisions|ringtone_purchases|is immutable|violates foreign key|foreign key constraint|duplicate key|PGRST|postgres|sqlstate|relation ["']|column ["']|permission denied for/i;

export function isUnsafeRingtoneErrorMessage(message: string) {
    return UNSAFE_ERROR_PATTERN.test(String(message || ""));
}

export function toPublicRingtoneActionError(
    error: unknown,
    fallback = RINGTONE_ACTION_FAILED_MESSAGE,
) {
    const message = getErrorMessage(error);
    if (!message || isUnsafeRingtoneErrorMessage(message)) {
        return fallback;
    }
    return message;
}

export function logRingtoneActionFailure(scope: string, error: unknown) {
    console.error(`[${scope}]`, getErrorMessage(error));
}
