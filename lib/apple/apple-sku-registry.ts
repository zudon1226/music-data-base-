import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppleCatalogSkuRow } from "./apple-transaction-verify-logic";

export type AppleProductListFilter = {
    entityType?: string;
    planSlug?: string;
};

function isMissingAppleCatalogTable(error: unknown) {
    const message = String((error as { message?: string })?.message || error || "").toLowerCase();
    return message.includes("apple_catalog_skus") && (message.includes("does not exist") || message.includes("relation"));
}

export async function listActiveAppleProductIds(
    supabase: SupabaseClient,
    filter: AppleProductListFilter = {},
): Promise<{ ok: true; productIds: string[]; setupRequired: boolean } | { ok: false; error: string }> {
    let query = supabase
        .from("apple_catalog_skus")
        .select("apple_product_id")
        .eq("active", true)
        .order("apple_product_id", { ascending: true });

    const entityType = String(filter.entityType || "").trim();
    if (entityType) query = query.eq("entity_type", entityType);

    const planSlug = String(filter.planSlug || "").trim();
    if (planSlug) query = query.eq("plan_slug", planSlug);

    const { data, error } = await query;
    if (error) {
        if (isMissingAppleCatalogTable(error)) {
            return { ok: true, productIds: [], setupRequired: true };
        }
        return { ok: false, error: error.message };
    }

    const productIds = (data || [])
        .map((row) => String((row as { apple_product_id?: string }).apple_product_id || "").trim())
        .filter(Boolean);

    return { ok: true, productIds, setupRequired: false };
}

export async function resolveAppleCatalogSku(
    supabase: SupabaseClient,
    appleProductId: string,
): Promise<
    | { ok: true; sku: AppleCatalogSkuRow; setupRequired: false }
    | { ok: false; code: "UNKNOWN_SKU"; error: string; setupRequired?: boolean }
    | { ok: false; code: "DB_ERROR"; error: string }
> {
    const productId = String(appleProductId || "").trim();
    if (!productId) {
        return { ok: false, code: "UNKNOWN_SKU", error: "Unknown Apple product id." };
    }

    const { data, error } = await supabase
        .from("apple_catalog_skus")
        .select("apple_product_id, entity_type, entity_id, plan_slug, license_type, billing_interval, active")
        .eq("apple_product_id", productId)
        .maybeSingle();

    if (error) {
        if (isMissingAppleCatalogTable(error)) {
            return { ok: false, code: "UNKNOWN_SKU", error: "Apple IAP catalog is not provisioned.", setupRequired: true };
        }
        return { ok: false, code: "DB_ERROR", error: error.message };
    }

    if (!data || !data.active) {
        return { ok: false, code: "UNKNOWN_SKU", error: "Unknown or inactive Apple product id." };
    }

    return {
        ok: true,
        setupRequired: false,
        sku: data as AppleCatalogSkuRow,
    };
}
