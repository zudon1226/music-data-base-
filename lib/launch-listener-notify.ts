/**
 * Listener launch-notification signups (email only, no auth account).
 * Stored in public.launch_listener_notify via service-role API only.
 */

import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeListenerNotifyEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

export function validateListenerNotifyEmail(value: unknown):
    | { ok: true; email: string }
    | { ok: false; error: string } {
    const email = normalizeListenerNotifyEmail(value);
    if (!email) {
        return { ok: false, error: "Email is required." };
    }
    if (email.length > 320) {
        return { ok: false, error: "Email is too long." };
    }
    if (!EMAIL_PATTERN.test(email)) {
        return { ok: false, error: "Enter a valid email address." };
    }
    return { ok: true, email };
}

function isMissingLaunchListenerNotifyTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("launch_listener_notify")
        || message.includes("schema cache")
        || message.includes("does not exist");
}

function isUniqueViolation(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const record = error as { code?: string };
    return record.code === "23505";
}

export async function registerListenerLaunchNotify(rawEmail: string) {
    const validated = validateListenerNotifyEmail(rawEmail);
    if (!validated.ok) {
        return { ok: false as const, status: 400 as const, error: validated.error };
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("launch_listener_notify")
        .insert({ email: validated.email })
        .select("id")
        .maybeSingle();

    if (!error) {
        return { ok: true as const, duplicate: false };
    }

    if (isUniqueViolation(error)) {
        return { ok: true as const, duplicate: true };
    }

    if (isMissingLaunchListenerNotifyTable(error)) {
        console.error("[launch-listener-notify] table missing:", error);
        return {
            ok: false as const,
            status: 503 as const,
            error: "Launch notifications are not available right now. Please try again later.",
            setupRequired: true,
        };
    }

    console.error("[launch-listener-notify] insert failed:", error);
    return {
        ok: false as const,
        status: 500 as const,
        error: "Could not save your notification request.",
    };
}
