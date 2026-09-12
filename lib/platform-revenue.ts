/**
 * Platform-only revenue ledger.
 * Sponsor payments record here — NEVER in earnings_events or creator payouts.
 */

import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export type RecordPlatformRevenueInput = {
    sourceType: "sponsor" | "subscription" | "other";
    sourceId: string;
    grossAmountCents: number;
    netAmountCents?: number;
    currency?: string;
    paymentProvider?: string;
    paymentReference?: string;
    metadata?: Record<string, unknown>;
};

export async function recordPlatformRevenue(input: RecordPlatformRevenueInput) {
    if (!isUuid(input.sourceId)) {
        return { ok: false as const, error: "Invalid source id.", skipped: true };
    }
    const gross = Math.max(0, Math.round(Number(input.grossAmountCents) || 0));
    if (gross <= 0) return { ok: true as const, skipped: true };

    const paymentReference = String(input.paymentReference || "").trim();
    const supabase = getSupabaseServerClient();

    if (paymentReference) {
        const { data: existing } = await supabase
            .from("platform_revenue_events")
            .select("id")
            .eq("source_type", input.sourceType)
            .eq("source_id", input.sourceId)
            .eq("payment_reference", paymentReference)
            .eq("is_reversal", false)
            .maybeSingle();
        if (existing?.id) return { ok: true as const, skipped: true, duplicate: true, id: existing.id };
    }

    const net = input.netAmountCents != null
        ? Math.max(0, Math.round(input.netAmountCents))
        : gross;

    const { data, error } = await supabase
        .from("platform_revenue_events")
        .insert({
            source_type: input.sourceType,
            source_id: input.sourceId,
            gross_amount_cents: gross,
            net_amount_cents: net,
            currency: String(input.currency || "USD").toUpperCase(),
            payment_provider: String(input.paymentProvider || ""),
            payment_reference: paymentReference,
            status: "recorded",
            is_reversal: false,
            metadata: input.metadata || {},
        })
        .select("id")
        .single();

    if (error) throw new Error(getErrorMessage(error));
    return { ok: true as const, skipped: false, id: data.id };
}

export async function applyPlatformRevenueRefund(input: {
    sourceType: string;
    sourceId: string;
    paymentReference?: string;
    refundAmountCents?: number;
    reason?: string;
    providerEventId?: string;
}) {
    if (!isUuid(input.sourceId)) return { ok: true as const, applied: false, duplicate: false };

    const supabase = getSupabaseServerClient();
    let query = supabase
        .from("platform_revenue_events")
        .select("*")
        .eq("source_type", input.sourceType)
        .eq("source_id", input.sourceId)
        .eq("is_reversal", false)
        .in("status", ["recorded", "partial_refund"]);

    if (input.paymentReference) {
        query = query.eq("payment_reference", input.paymentReference);
    }

    const { data: original, error } = await query.maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    if (!original) return { ok: true as const, applied: false, duplicate: false };

    if (input.providerEventId) {
        const { data: existingForEvent } = await supabase
            .from("platform_revenue_events")
            .select("id")
            .eq("is_reversal", true)
            .filter("metadata->>providerEventId", "eq", input.providerEventId)
            .maybeSingle();
        if (existingForEvent?.id) {
            return {
                ok: true as const,
                applied: false,
                duplicate: true,
                cumulativeRefundedCents: Math.max(0, Number(original.refunded_amount_cents || 0)),
            };
        }
    }

    const grossCents = Math.max(0, Number(original.gross_amount_cents || 0));
    const alreadyRefunded = Math.max(0, Number(original.refunded_amount_cents || 0));
    const remainingRefundable = Math.max(0, grossCents - alreadyRefunded);
    if (remainingRefundable <= 0) {
        return {
            ok: true as const,
            applied: false,
            duplicate: true,
            cumulativeRefundedCents: alreadyRefunded,
        };
    }

    const refundDelta = input.refundAmountCents != null
        ? Math.max(0, Math.round(Number(input.refundAmountCents) || 0))
        : remainingRefundable;
    const appliedRefund = Math.min(refundDelta, remainingRefundable);
    if (appliedRefund <= 0) {
        return { ok: true as const, applied: false, duplicate: false, cumulativeRefundedCents: alreadyRefunded };
    }

    const cumulativeRefundedCents = alreadyRefunded + appliedRefund;
    const fullyRefunded = cumulativeRefundedCents >= grossCents;

    const { error: insertError } = await supabase.from("platform_revenue_events").insert({
        source_type: input.sourceType,
        source_id: input.sourceId,
        gross_amount_cents: appliedRefund,
        net_amount_cents: appliedRefund,
        refunded_amount_cents: appliedRefund,
        currency: String(original.currency || "USD"),
        payment_provider: String(original.payment_provider || ""),
        payment_reference: String(original.payment_reference || input.paymentReference || ""),
        status: fullyRefunded ? "reversed" : "reversed",
        is_reversal: true,
        metadata: {
            reason: input.reason || "refund",
            providerEventId: input.providerEventId || null,
            originalEventId: original.id,
            refundDeltaCents: appliedRefund,
            cumulativeRefundedCents,
        },
    });
    if (insertError) throw new Error(getErrorMessage(insertError));

    await supabase
        .from("platform_revenue_events")
        .update({
            status: fullyRefunded ? "refunded" : "partial_refund",
            refunded_amount_cents: cumulativeRefundedCents,
        })
        .eq("id", original.id);

    return {
        ok: true as const,
        applied: true,
        duplicate: false,
        cumulativeRefundedCents,
        refundDeltaCents: appliedRefund,
        fullyRefunded,
    };
}

/** Full refund helper — delegates to applyPlatformRevenueRefund for remaining balance. */
export async function reversePlatformRevenueForSource(input: {
    sourceType: string;
    sourceId: string;
    paymentReference?: string;
    reason?: string;
    providerEventId?: string;
    refundAmountCents?: number;
}) {
    const result = await applyPlatformRevenueRefund({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        paymentReference: input.paymentReference,
        refundAmountCents: input.refundAmountCents,
        reason: input.reason,
        providerEventId: input.providerEventId,
    });
    return {
        ok: result.ok,
        reversed: Boolean(result.applied),
        duplicate: Boolean(result.duplicate),
        cumulativeRefundedCents: result.cumulativeRefundedCents,
    };
}

export async function getPlatformRevenueSummary(sourceType?: string) {
    const supabase = getSupabaseServerClient();
    let query = supabase
        .from("platform_revenue_events")
        .select("gross_amount_cents,net_amount_cents,refunded_amount_cents,currency,is_reversal,status,source_type");
    if (sourceType) query = query.eq("source_type", sourceType);
    const { data, error } = await query;
    if (error) throw new Error(getErrorMessage(error));

    let grossCents = 0;
    let netCents = 0;
    let sponsorGrossCents = 0;
    for (const row of data || []) {
        const gross = Number(row.gross_amount_cents || 0);
        if (row.is_reversal) {
            grossCents -= gross;
            netCents -= Number(row.net_amount_cents || 0);
            if (row.source_type === "sponsor") sponsorGrossCents -= gross;
        } else if (row.status === "recorded") {
            grossCents += gross;
            netCents += Number(row.net_amount_cents || 0);
            if (row.source_type === "sponsor") sponsorGrossCents += gross;
        }
    }
    return {
        grossCents: Math.max(0, grossCents),
        netCents: Math.max(0, netCents),
        sponsorGrossCents: Math.max(0, sponsorGrossCents),
        eventCount: (data || []).length,
    };
}
