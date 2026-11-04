/**
 * Read-only aggregation of authenticated listener purchase vault data.
 * Server-side only — always scope queries to the verified user id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAppleVerifiedReceiptLines } from "@/lib/apple/apple-listener-vault";
import { getErrorMessage } from "@/lib/server-supabase";

export type ListenerPurchaseLine = {
    id: string;
    orderNumber: string;
    category: "album" | "beat" | "song" | "ringtone";
    title: string;
    creatorName: string;
    itemType: string;
    licenseType: string;
    priceCents: number;
    currency: string;
    paymentStatus: string;
    refundStatus: string;
    purchasedAt: string;
    coverUrl: string;
};

export type ListenerReceiptLine = {
    id: string;
    orderNumber: string;
    label: string;
    totalCents: number;
    currency: string;
    paymentStatus: string;
    paymentProvider: string;
    confirmedAt: string;
};

export type ListenerVaultDownload = {
    id: string;
    source: "marketplace_vault" | "media_download";
    title: string;
    itemType: string;
    licenseType: string;
    filename: string;
    contentId: string;
    contentType: string;
    accessLabel: string;
    addedAt: string;
    coverUrl: string;
};

export type ListenerLicenseLine = {
    id: string;
    beatTitle: string;
    producerName: string;
    licenseType: string;
    priceCents: number;
    currency: string;
    issuedAt: string;
    pdfFileName: string;
    transactionId: string;
};

export type ListenerPurchasesBundle = {
    purchases: ListenerPurchaseLine[];
    receipts: ListenerReceiptLine[];
    downloads: ListenerVaultDownload[];
    licenses: ListenerLicenseLine[];
    digitalAccess: ListenerVaultDownload[];
};

export function shortOrderNumber(id: string) {
    const clean = String(id || "").replace(/-/g, "").toUpperCase();
    if (clean.length >= 8) return `MDB-${clean.slice(0, 8)}`;
    return clean ? `MDB-${clean}` : "MDB-ORDER";
}

export function formatRefundStatus(status: string) {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized === "refunded") return "Refunded";
    if (normalized === "completed") return "Not refunded";
    if (normalized === "pending") return "Pending";
    if (normalized === "cancelled") return "Cancelled";
    if (normalized === "failed") return "Failed";
    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Unknown";
}

function mapMarketplacePurchase(row: Record<string, unknown>): ListenerPurchaseLine {
    const itemType = String(row.item_type || "song").toLowerCase();
    const category =
        itemType === "album" ? "album"
            : itemType === "beat" ? "beat"
                : "song";
    const id = String(row.id || "");
    return {
        id,
        orderNumber: shortOrderNumber(id),
        category,
        title: String(row.title || "Untitled"),
        creatorName: String(row.creator_name || ""),
        itemType,
        licenseType: String(row.license_type || ""),
        priceCents: Math.max(0, Math.round(Number(row.price_cents) || 0)),
        currency: String(row.currency || "USD"),
        paymentStatus: String(row.status || "pending"),
        refundStatus: formatRefundStatus(String(row.status || "")),
        purchasedAt: String(row.purchased_at || row.created_at || ""),
        coverUrl: String(row.cover_url || ""),
    };
}

export function isMarketplaceReceiptRow(row: Record<string, unknown>) {
    const status = String(row.status || "").trim().toLowerCase();
    if (status === "refunded") return true;
    if (status !== "completed") return false;
    const confirmedAt = String(row.payment_confirmed_at || "").trim();
    const paymentIntent = String(row.provider_payment_intent_id || "").trim();
    const checkoutSession = String(row.provider_checkout_session_id || "").trim();
    return Boolean(confirmedAt || paymentIntent || checkoutSession);
}

export function isRingtoneReceiptRow(row: Record<string, unknown>) {
    return String(row.payment_status || "").trim().toLowerCase() === "paid";
}

function mapRingtoneReceipt(row: Record<string, unknown>, product: Record<string, unknown> | null): ListenerReceiptLine {
    const id = String(row.id || "");
    const title = String(product?.title || "Ringtone");
    return {
        id,
        orderNumber: shortOrderNumber(id),
        label: `${title} (ringtone)`,
        totalCents: Math.max(0, Math.round(Number(row.amount_cents) || 0)),
        currency: String(row.currency || "USD"),
        paymentStatus: "paid",
        paymentProvider: String(row.payment_provider || row.payment_reference || "—"),
        confirmedAt: String(row.purchased_at || row.created_at || ""),
    };
}

function mapReceipt(row: Record<string, unknown>): ListenerReceiptLine {
    const id = String(row.id || "");
    const itemType = String(row.item_type || "item");
    const title = String(row.title || "Purchase");
    return {
        id,
        orderNumber: shortOrderNumber(id),
        label: `${title} (${itemType})`,
        totalCents: Math.max(0, Math.round(Number(row.price_cents) || 0)),
        currency: String(row.currency || "USD"),
        paymentStatus: String(row.status || "pending"),
        paymentProvider: String(row.payment_provider || "—"),
        confirmedAt: String(row.payment_confirmed_at || row.purchased_at || row.created_at || ""),
    };
}

function mapVaultDownload(row: Record<string, unknown>): ListenerVaultDownload {
    return {
        id: String(row.id || ""),
        source: "marketplace_vault",
        title: String(row.title || "Untitled"),
        itemType: String(row.item_type || ""),
        licenseType: String(row.license_type || ""),
        filename: String(row.license_pdf_file_name || ""),
        contentId: String(row.item_id || ""),
        contentType: String(row.item_type || ""),
        accessLabel: "Purchased download",
        addedAt: String(row.created_at || row.added_at || ""),
        coverUrl: String(row.cover_url || ""),
    };
}

function mapMediaDownload(row: Record<string, unknown>): ListenerVaultDownload {
    const contentType = String(row.content_type || "music");
    return {
        id: String(row.id || ""),
        source: "media_download",
        title: String(row.title || row.filename || "Download"),
        itemType: contentType === "video" ? "video" : "song",
        licenseType: "",
        filename: String(row.filename || ""),
        contentId: String(row.content_id || ""),
        contentType,
        accessLabel: String(row.plan_name || row.access_source || "Premium listener"),
        addedAt: String(row.last_downloaded_at || row.created_at || ""),
        coverUrl: "",
    };
}

function mapLicense(row: Record<string, unknown>): ListenerLicenseLine {
    return {
        id: String(row.id || ""),
        beatTitle: String(row.beat_title || ""),
        producerName: String(row.producer_name || ""),
        licenseType: String(row.license_type || "Basic"),
        priceCents: Math.max(0, Math.round(Number(row.price_cents) || 0)),
        currency: String(row.currency || "USD"),
        issuedAt: String(row.issued_at || row.created_at || ""),
        pdfFileName: String(row.pdf_file_name || "music-data-base-license.pdf"),
        transactionId: String(row.transaction_id || ""),
    };
}

function mapRingtonePurchase(row: Record<string, unknown>, product: Record<string, unknown> | null): ListenerPurchaseLine {
    const id = String(row.id || "");
    return {
        id,
        orderNumber: shortOrderNumber(id),
        category: "ringtone",
        title: String(product?.title || "Ringtone"),
        creatorName: "",
        itemType: "ringtone",
        licenseType: "",
        priceCents: Math.max(0, Math.round(Number(row.amount_cents) || 0)),
        currency: String(row.currency || "USD"),
        paymentStatus: String(row.payment_status || "pending"),
        refundStatus: formatRefundStatus(String(row.payment_status || "").replace("paid", "completed")),
        purchasedAt: String(row.purchased_at || row.created_at || ""),
        coverUrl: String(product?.artwork_url || ""),
    };
}

function isMissingTable(error: unknown, tableName: string) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes(tableName.toLowerCase())
        || message.includes("schema cache")
        || message.includes("does not exist");
}

export async function loadListenerPurchasesBundle(
    supabase: SupabaseClient,
    userId: string,
): Promise<{ ok: true; bundle: ListenerPurchasesBundle; setupRequired: boolean } | { ok: false; error: string }> {
    let setupRequired = false;

    const purchaseResult = await supabase
        .from("purchase_history")
        .select("*")
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false })
        .limit(200);

    if (purchaseResult.error && isMissingTable(purchaseResult.error, "purchase_history")) {
        setupRequired = true;
    } else if (purchaseResult.error) {
        return { ok: false, error: getErrorMessage(purchaseResult.error) };
    }

    const vaultResult = await supabase
        .from("download_vault")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

    if (vaultResult.error && isMissingTable(vaultResult.error, "download_vault")) {
        setupRequired = true;
    } else if (vaultResult.error) {
        return { ok: false, error: getErrorMessage(vaultResult.error) };
    }

    const licenseResult = await supabase
        .from("license_records")
        .select("id,user_id,beat_id,beat_title,producer_id,producer_name,buyer_name,license_type,price_cents,currency,pdf_file_name,terms,transaction_id,issued_at,created_at")
        .eq("user_id", userId)
        .order("issued_at", { ascending: false })
        .limit(200);

    if (licenseResult.error && isMissingTable(licenseResult.error, "license_records")) {
        setupRequired = true;
    } else if (licenseResult.error) {
        return { ok: false, error: getErrorMessage(licenseResult.error) };
    }

    let mediaRows: Record<string, unknown>[] = [];
    const mediaResult = await supabase
        .from("media_downloads")
        .select("id,user_id,content_id,content_type,title,filename,access_source,plan_name,plan_slug,delivery_status,download_count,last_downloaded_at,created_at")
        .eq("user_id", userId)
        .eq("delivery_status", "delivered")
        .order("last_downloaded_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);

    if (mediaResult.error) {
        const missingColumn = /column .* does not exist|last_downloaded_at|access_source|download_count|title/i.test(
            getErrorMessage(mediaResult.error),
        );
        if (missingColumn) {
            const fallback = await supabase
                .from("media_downloads")
                .select("id,user_id,content_id,content_type,filename,plan_name,plan_slug,delivery_status,created_at")
                .eq("user_id", userId)
                .eq("delivery_status", "delivered")
                .order("created_at", { ascending: false })
                .limit(200);
            if (fallback.error) {
                if (isMissingTable(fallback.error, "media_downloads")) {
                    setupRequired = true;
                } else {
                    return { ok: false, error: getErrorMessage(fallback.error) };
                }
            } else {
                mediaRows = (fallback.data || []) as Record<string, unknown>[];
            }
        } else if (isMissingTable(mediaResult.error, "media_downloads")) {
            setupRequired = true;
        } else {
            return { ok: false, error: getErrorMessage(mediaResult.error) };
        }
    } else {
        mediaRows = (mediaResult.data || []) as Record<string, unknown>[];
    }

    let ringtoneRows: Record<string, unknown>[] = [];
    const ringtoneResult = await supabase
        .from("ringtone_purchases")
        .select("id,ringtone_id,buyer_id,amount_cents,currency,payment_status,payment_provider,payment_reference,purchased_at,created_at")
        .eq("buyer_id", userId)
        .order("purchased_at", { ascending: false })
        .limit(200);

    if (ringtoneResult.error) {
        const missingColumn = /column .* does not exist|payment_provider|payment_reference/i.test(
            getErrorMessage(ringtoneResult.error),
        );
        if (missingColumn) {
            const fallback = await supabase
                .from("ringtone_purchases")
                .select("id,ringtone_id,buyer_id,amount_cents,currency,payment_status,purchased_at,created_at")
                .eq("buyer_id", userId)
                .order("purchased_at", { ascending: false })
                .limit(200);
            if (fallback.error) {
                if (isMissingTable(fallback.error, "ringtone_purchases")) {
                    setupRequired = true;
                } else {
                    return { ok: false, error: getErrorMessage(fallback.error) };
                }
            } else {
                ringtoneRows = (fallback.data || []) as Record<string, unknown>[];
            }
        } else if (isMissingTable(ringtoneResult.error, "ringtone_purchases")) {
            setupRequired = true;
        } else {
            return { ok: false, error: getErrorMessage(ringtoneResult.error) };
        }
    } else {
        ringtoneRows = (ringtoneResult.data || []) as Record<string, unknown>[];
    }
    const ringtoneIds = [...new Set(ringtoneRows.map((row) => String((row as { ringtone_id?: string }).ringtone_id || "")).filter(Boolean))];
    let productById = new Map<string, Record<string, unknown>>();
    if (ringtoneIds.length > 0) {
        const products = await supabase
            .from("ringtone_products")
            .select("id,title,artwork_url")
            .in("id", ringtoneIds);
        if (!products.error) {
            productById = new Map((products.data || []).map((row) => [String(row.id), row as Record<string, unknown>]));
        }
    }

    const marketplacePurchases = (purchaseResult.data || []).map((row) =>
        mapMarketplacePurchase(row as Record<string, unknown>));
    const marketplaceRingtoneKeys = new Set(
        (purchaseResult.data || [])
            .map((row) => {
                const record = row as Record<string, unknown>;
                const itemType = String(record.item_type || "").trim().toLowerCase();
                const itemId = String(record.item_id || "").trim();
                return itemType === "ringtone" && itemId ? `ringtone:${itemId}` : "";
            })
            .filter(Boolean),
    );

    const ringtonePurchases = ringtoneRows
        .filter((row) => {
            const record = row as Record<string, unknown>;
            const ringtoneId = String(record.ringtone_id || "").trim();
            if (!ringtoneId) return true;
            return !marketplaceRingtoneKeys.has(`ringtone:${ringtoneId}`);
        })
        .map((row) => {
            const record = row as Record<string, unknown>;
            const product = productById.get(String(record.ringtone_id || "")) || null;
            return mapRingtonePurchase(record, product);
        });

    const purchases = [...marketplacePurchases, ...ringtonePurchases].sort((a, b) =>
        String(b.purchasedAt).localeCompare(String(a.purchasedAt)));

    const marketplaceReceipts = (purchaseResult.data || [])
        .filter((row) => isMarketplaceReceiptRow(row as Record<string, unknown>))
        .map((row) => mapReceipt(row as Record<string, unknown>));
    const ringtoneReceipts = ringtoneRows
        .filter((row) => isRingtoneReceiptRow(row as Record<string, unknown>))
        .map((row) => {
            const record = row as Record<string, unknown>;
            const product = productById.get(String(record.ringtone_id || "")) || null;
            return mapRingtoneReceipt(record, product);
        });
    let appleReceipts: ListenerReceiptLine[] = [];
    const appleLoaded = await loadAppleVerifiedReceiptLines(supabase, userId);
    if (!appleLoaded.ok) {
        return { ok: false, error: appleLoaded.error };
    }
    if (appleLoaded.setupRequired) {
        setupRequired = true;
    } else {
        appleReceipts = appleLoaded.receipts;
    }

    const stripeReceiptIds = new Set([...marketplaceReceipts, ...ringtoneReceipts].map((row) => row.id));
    const dedupedAppleReceipts = appleReceipts.filter((row) => !stripeReceiptIds.has(row.id));

    const receipts = [...marketplaceReceipts, ...ringtoneReceipts, ...dedupedAppleReceipts].sort((a, b) =>
        String(b.confirmedAt).localeCompare(String(a.confirmedAt)));

    const vaultDownloads = (vaultResult.data || []).map((row) =>
        mapVaultDownload(row as Record<string, unknown>));
    const mediaDownloads = mediaRows.map((row) => mapMediaDownload(row));
    const downloads = [...vaultDownloads, ...mediaDownloads];
    const licenses = (licenseResult.data || []).map((row) => mapLicense(row as Record<string, unknown>));

    return {
        ok: true,
        setupRequired,
        bundle: {
            purchases,
            receipts,
            downloads,
            licenses,
            digitalAccess: downloads,
        },
    };
}
