import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicBetaCommerceLocked } from "../public-beta-commerce-lock";
import { APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED } from "./apple-iap-stage1";
import type { AppleCatalogSkuRow } from "./apple-transaction-verify-logic";
import type { VerifiedAppleTransaction } from "./app-store-jws";

export type AppleFulfillmentAttemptResult = {
    attempted: false;
    entitlementsGranted: false;
    reason: "STAGE1_KILL_SWITCH" | "COMMERCE_LOCKED" | "GRANTS_DISABLED";
};

/** Stage 2+ fulfillment entry — never grants during public beta or Stage 1 kill switch. */
export async function fulfillVerifiedAppleTransactionIfAllowed(_input: {
    supabase: SupabaseClient;
    userId: string;
    sku: AppleCatalogSkuRow;
    transaction: VerifiedAppleTransaction;
}): Promise<AppleFulfillmentAttemptResult> {
    if (APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED) {
        return { attempted: false, entitlementsGranted: false, reason: "STAGE1_KILL_SWITCH" };
    }
    if (isPublicBetaCommerceLocked()) {
        return { attempted: false, entitlementsGranted: false, reason: "COMMERCE_LOCKED" };
    }
    return { attempted: false, entitlementsGranted: false, reason: "GRANTS_DISABLED" };
}
