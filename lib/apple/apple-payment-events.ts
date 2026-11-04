import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppleIapClientEnvironment } from "./app-store-config";

export type ApplePaymentEventOutcome =
    | "verified_no_grant"
    | "fulfilled"
    | "duplicate"
    | "rejected"
    | "asn_no_grant"
    | "restored_no_grant"
    | "revoked_no_grant";

export type ApplePaymentNotificationType = "client_verify" | "asn" | "restore";

export type ApplePaymentEventRow = {
    id: string;
    provider_event_id: string;
    user_id: string | null;
    outcome: ApplePaymentEventOutcome;
    commerce_locked: boolean;
    original_transaction_id?: string | null;
};

function isMissingAppleEventsTable(error: unknown) {
    const message = String((error as { message?: string })?.message || error || "").toLowerCase();
    return message.includes("apple_payment_events") && (message.includes("does not exist") || message.includes("relation"));
}

export async function fetchApplePaymentEventByProviderEventId(
    supabase: SupabaseClient,
    providerEventId: string,
): Promise<{ ok: true; row: ApplePaymentEventRow | null; setupRequired: boolean } | { ok: false; error: string }> {
    const { data, error } = await supabase
        .from("apple_payment_events")
        .select("id, provider_event_id, user_id, outcome, commerce_locked, original_transaction_id")
        .eq("provider", "apple")
        .eq("provider_event_id", providerEventId)
        .maybeSingle();

    if (error) {
        if (isMissingAppleEventsTable(error)) {
            return { ok: true, row: null, setupRequired: true };
        }
        return { ok: false, error: error.message };
    }

    return { ok: true, row: (data as ApplePaymentEventRow | null) ?? null, setupRequired: false };
}

export async function fetchApplePaymentOwnerByOriginalTransactionId(
    supabase: SupabaseClient,
    originalTransactionId: string,
): Promise<{ ok: true; userId: string | null; setupRequired: boolean } | { ok: false; error: string }> {
    const { data, error } = await supabase
        .from("apple_payment_events")
        .select("user_id")
        .eq("provider", "apple")
        .eq("original_transaction_id", originalTransactionId)
        .not("user_id", "is", null)
        .order("processed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        if (isMissingAppleEventsTable(error)) {
            return { ok: true, userId: null, setupRequired: true };
        }
        return { ok: false, error: error.message };
    }

    const userId = String((data as { user_id?: string | null })?.user_id || "").trim() || null;
    return { ok: true, userId, setupRequired: false };
}

export type InsertApplePaymentEventInput = {
    providerEventId: string;
    originalTransactionId?: string;
    notificationType: ApplePaymentNotificationType;
    userId?: string | null;
    appleProductId: string;
    environment: AppleIapClientEnvironment;
    payloadHash: string;
    outcome: ApplePaymentEventOutcome;
    commerceLocked: boolean;
    payload: Record<string, unknown>;
};

export async function insertApplePaymentEvent(
    supabase: SupabaseClient,
    input: InsertApplePaymentEventInput,
): Promise<
    | { ok: true; inserted: true; row: ApplePaymentEventRow }
    | { ok: true; inserted: false; duplicate: true; row: ApplePaymentEventRow | null }
    | { ok: false; error: string; setupRequired?: boolean }
> {
    const { data, error } = await supabase
        .from("apple_payment_events")
        .insert({
            provider: "apple",
            provider_event_id: input.providerEventId,
            original_transaction_id: input.originalTransactionId || null,
            notification_type: input.notificationType,
            user_id: input.userId ?? null,
            apple_product_id: input.appleProductId,
            environment: input.environment,
            payload_hash: input.payloadHash,
            outcome: input.outcome,
            commerce_locked: input.commerceLocked,
            payload: input.payload,
        })
        .select("id, provider_event_id, user_id, outcome, commerce_locked, original_transaction_id")
        .maybeSingle();

    if (!error && data) {
        return { ok: true, inserted: true, row: data as ApplePaymentEventRow };
    }

    const isUniqueViolation =
        String(error?.code || "") === "23505"
        || String(error?.message || "").toLowerCase().includes("duplicate");

    if (isUniqueViolation) {
        const existing = await fetchApplePaymentEventByProviderEventId(supabase, input.providerEventId);
        if (!existing.ok) return { ok: false, error: existing.error };
        return { ok: true, inserted: false, duplicate: true, row: existing.row };
    }

    if (error && isMissingAppleEventsTable(error)) {
        return { ok: false, error: "Apple IAP events table is not provisioned.", setupRequired: true };
    }

    return { ok: false, error: error?.message || "Failed to record Apple payment event." };
}
