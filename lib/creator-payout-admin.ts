/**
 * Server-side admin payout review (DB only — no Stripe transfer execution).
 */

import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

const ADMIN_PAYOUT_STATUSES = new Set(["processing", "paid", "failed", "canceled"]);

export async function listAdminPayouts(input: { status?: string; limit?: number } = {}) {
    const supabase = getSupabaseServerClient();
    let query = supabase
        .from("payouts")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));
    if (input.status) {
        query = query.eq("status", input.status);
    }
    const { data, error } = await query;
    if (error) throw new Error(getErrorMessage(error));
    return data || [];
}

export async function adminUpdatePayoutStatus(input: {
    payoutId: string;
    status: string;
    adminUserId: string;
    notes?: string;
}) {
    const payoutId = String(input.payoutId || "").trim();
    const status = String(input.status || "").trim().toLowerCase();
    if (!isUuid(payoutId)) throw new Error("payoutId is required.");
    if (!ADMIN_PAYOUT_STATUSES.has(status)) {
        throw new Error("status must be processing, paid, failed, or canceled.");
    }

    const supabase = getSupabaseServerClient();
    const { data: existing, error: readError } = await supabase
        .from("payouts")
        .select("*")
        .eq("id", payoutId)
        .maybeSingle();
    if (readError) throw new Error(getErrorMessage(readError));
    if (!existing) throw new Error("Payout not found.");

    const now = new Date().toISOString();
    const metadata = {
        ...((existing.metadata && typeof existing.metadata === "object") ? existing.metadata : {}),
        adminReviewedAt: now,
        adminReviewedBy: input.adminUserId,
    };

    const { data, error } = await supabase
        .from("payouts")
        .update({
            status,
            reviewed_by: input.adminUserId,
            reviewed_at: now,
            notes: input.notes?.trim() || existing.notes || null,
            paid_at: status === "paid" ? (existing.paid_at || now) : existing.paid_at,
            metadata,
            updated_at: now,
        })
        .eq("id", payoutId)
        .select("*")
        .single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}
