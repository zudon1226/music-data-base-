import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListenerReceiptLine } from "@/lib/listener-purchases-service";
import { shortOrderNumber } from "@/lib/listener-purchases-service";

const VERIFIED_APPLE_OUTCOMES = new Set([
    "verified_no_grant",
    "fulfilled",
    "restored_no_grant",
    "asn_no_grant",
]);

export async function loadAppleVerifiedReceiptLines(
    supabase: SupabaseClient,
    userId: string,
): Promise<{ ok: true; receipts: ListenerReceiptLine[]; setupRequired: boolean } | { ok: false; error: string }> {
    const { data, error } = await supabase
        .from("apple_payment_events")
        .select("id, apple_product_id, outcome, processed_at, environment, provider_event_id")
        .eq("provider", "apple")
        .eq("user_id", userId)
        .in("outcome", Array.from(VERIFIED_APPLE_OUTCOMES))
        .order("processed_at", { ascending: false })
        .limit(100);

    if (error) {
        const message = String(error.message || "").toLowerCase();
        if (message.includes("apple_payment_events") && message.includes("does not exist")) {
            return { ok: true, receipts: [], setupRequired: true };
        }
        return { ok: false, error: error.message };
    }

    const receipts: ListenerReceiptLine[] = (data || []).map((row) => {
        const id = String((row as { id?: string }).id || "");
        const productId = String((row as { apple_product_id?: string }).apple_product_id || "Apple product");
        const outcome = String((row as { outcome?: string }).outcome || "");
        const confirmedAt = String((row as { processed_at?: string }).processed_at || "");
        return {
            id,
            orderNumber: shortOrderNumber(id),
            label: `${productId} (Apple — verified, no beta grant)`,
            totalCents: 0,
            currency: "USD",
            paymentStatus: outcome.includes("revoked") ? "revoked" : "verified",
            paymentProvider: "apple",
            confirmedAt,
        };
    });

    return { ok: true, receipts, setupRequired: false };
}
