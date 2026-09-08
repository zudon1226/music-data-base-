/**
 * Complete pending paid sales after verified Stripe Checkout confirmation.
 * Grants download vault + license records; records creator earnings.
 */

import { normalizeSalesLicenseType } from "@/lib/sales-catalog";
import { recordCreatorSaleEarnings } from "@/lib/creator-earnings";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { safeRandomUUID } from "@/lib/safe-random-uuid";

const PURCHASE_TABLE = "purchase_history";
const VAULT_TABLE = "download_vault";
const LICENSE_TABLE = "license_records";

export type PendingSaleRow = {
    id: string;
    user_id: string;
    item_id: string;
    item_type: string;
    title: string;
    creator_name?: string;
    cover_url?: string;
    download_url?: string;
    price_cents: number;
    currency: string;
    status: string;
    license_type?: string;
    license_terms?: unknown;
    license_id?: string;
    license_pdf_file_name?: string;
};

function isMissingTableError(error: unknown, table: string) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes(table) || message.includes("schema cache") || message.includes("does not exist");
}

export async function grantEntitlementsForCompletedPurchases(
    userId: string,
    purchases: PendingSaleRow[],
) {
    const supabase = getSupabaseServerClient();
    const purchasedAt = new Date().toISOString();
    const completed = purchases.filter((row) => String(row.status) === "completed");
    if (!completed.length) return { licenses: 0, vault: 0 };

    const licenseRows = completed
        .filter((purchase) => purchase.item_type === "beat" && normalizeSalesLicenseType(purchase.license_type))
        .map((purchase) => ({
            id: isUuid(String(purchase.license_id || "")) ? purchase.license_id : safeRandomUUID(),
            user_id: userId,
            beat_id: purchase.item_id,
            beat_title: purchase.title,
            producer_id: "",
            producer_name: purchase.creator_name || "",
            buyer_name: "",
            license_type: normalizeSalesLicenseType(purchase.license_type),
            price_cents: Math.max(0, Number(purchase.price_cents || 0)),
            currency: purchase.currency || "USD",
            pdf_file_name: purchase.license_pdf_file_name || `${purchase.title || "beat"}-${purchase.license_type || "license"}.pdf`,
            terms: Array.isArray(purchase.license_terms) ? purchase.license_terms : [],
            transaction_id: purchase.id,
            issued_at: purchasedAt,
        }));

    let licenses = 0;
    if (licenseRows.length > 0) {
        const { error } = await supabase
            .from(LICENSE_TABLE)
            .upsert(licenseRows, { onConflict: "user_id,beat_id,license_type" });
        if (error && !isMissingTableError(error, LICENSE_TABLE)) {
            throw new Error(getErrorMessage(error));
        }
        licenses = licenseRows.length;
    }

    const vaultRows = completed.map((purchase) => ({
        user_id: userId,
        purchase_id: purchase.id,
        item_id: purchase.item_id,
        item_type: purchase.item_type,
        title: purchase.title,
        creator_name: purchase.creator_name,
        cover_url: purchase.cover_url,
        download_url: purchase.download_url,
        price_cents: purchase.price_cents,
        currency: purchase.currency,
        license_type: purchase.license_type || "",
        license_terms: Array.isArray(purchase.license_terms) ? purchase.license_terms : [],
        license_id: purchase.license_id || "",
        license_pdf_file_name: purchase.license_pdf_file_name || "",
    }));

    let vault = 0;
    if (vaultRows.length > 0) {
        const { error } = await supabase
            .from(VAULT_TABLE)
            .upsert(vaultRows, { onConflict: "user_id,item_id,item_type,license_type" });
        if (error && !isMissingTableError(error, VAULT_TABLE)) {
            throw new Error(getErrorMessage(error));
        }
        vault = vaultRows.length;
    }

    return { licenses, vault };
}

export async function completePendingSalesFromStripeSession(input: {
    userId: string;
    purchaseIds: string[];
    providerPaymentId: string;
    providerCheckoutSessionId: string;
    providerPaymentIntentId?: string;
}) {
    if (!isUuid(input.userId) || !input.purchaseIds.length) {
        throw new Error("Invalid sales fulfillment input.");
    }

    const supabase = getSupabaseServerClient();
    const nowIso = new Date().toISOString();

    const { data: pendingRows, error: readError } = await supabase
        .from(PURCHASE_TABLE)
        .select("*")
        .eq("user_id", input.userId)
        .eq("status", "pending")
        .in("id", input.purchaseIds);
    if (readError) throw new Error(getErrorMessage(readError));

    const rows = (pendingRows || []) as PendingSaleRow[];
    if (!rows.length) {
        return { ok: true as const, duplicate: true, completedCount: 0 };
    }

    const patch: Record<string, unknown> = {
        status: "completed",
        payment_provider: "stripe",
        provider_checkout_session_id: input.providerCheckoutSessionId,
        payment_confirmed_at: nowIso,
    };
    if (input.providerPaymentIntentId) patch.provider_payment_intent_id = input.providerPaymentIntentId;

    const { error: updateError } = await supabase
        .from(PURCHASE_TABLE)
        .update(patch)
        .eq("user_id", input.userId)
        .eq("status", "pending")
        .in("id", input.purchaseIds);
    if (updateError) throw new Error(getErrorMessage(updateError));

    const completedRows = rows.map((row) => ({ ...row, status: "completed" }));
    await grantEntitlementsForCompletedPurchases(input.userId, completedRows);

    for (const row of completedRows) {
        if (Number(row.price_cents || 0) <= 0) continue;
        await recordCreatorSaleEarnings({
            purchaseId: row.id,
            itemId: row.item_id,
            itemType: row.item_type,
            creatorName: row.creator_name || "",
            grossAmountCents: Number(row.price_cents || 0),
            currency: row.currency || "USD",
            buyerUserId: input.userId,
        }).catch((error) => {
            console.warn("[sales-payment-fulfillment] earnings record failed:", getErrorMessage(error));
        });
    }

    await supabase.from("transactions").insert({
        user_id: input.userId,
        item_id: input.purchaseIds.join(",").slice(0, 120),
        item_type: "marketplace_sale",
        amount_cents: completedRows.reduce((sum, row) => sum + Math.max(0, Number(row.price_cents || 0)), 0),
        currency: completedRows[0]?.currency || "USD",
        status: "succeeded",
        transaction_type: "purchase",
        metadata: {
            provider: "stripe",
            providerPaymentId: input.providerPaymentId,
            purchaseIds: input.purchaseIds,
        },
    }).then(({ error }) => {
        if (error) console.warn("[sales-payment-fulfillment] transaction insert:", getErrorMessage(error));
    });

    return { ok: true as const, duplicate: false, completedCount: completedRows.length };
}
