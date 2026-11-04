import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicBetaCommerceLocked } from "../public-beta-commerce-lock";
import {
    fetchApplePaymentOwnerByOriginalTransactionId,
    insertApplePaymentEvent,
} from "./apple-payment-events";
import { fulfillVerifiedAppleTransactionIfAllowed } from "./apple-fulfillment-router";
import { resolveAppleCatalogSku } from "./apple-sku-registry";
import {
    assertTransactionOwnershipAllowed,
    hashAppleSignedPayload,
    validateAppAccountTokenForUser,
} from "./apple-transaction-verify-logic";
import { isAppleJwsVerificationError, verifyAppleSignedTransactionInfo } from "./app-store-jws";
import {
    isAppleIapVerifyRouteEnabled,
    normalizeAppleIapClientEnvironment,
} from "./app-store-config";
import { APPLE_IAP_STAGE1_VERIFY_OUTCOME } from "./apple-iap-stage1";

export type RestoreAppleTransactionsRequest = {
    userId: string;
    environment: string;
    signedTransactionInfos: string[];
};

export async function restoreAppleTransactionsForUser(
    supabase: SupabaseClient,
    input: RestoreAppleTransactionsRequest,
): Promise<{
    ok: true;
    commerceLocked: boolean;
    entitlementsGranted: false;
    restored: Array<{
        transactionId: string;
        originalTransactionId: string;
        appleProductId: string;
        duplicate?: boolean;
        outcome: typeof APPLE_IAP_STAGE1_VERIFY_OUTCOME | "restored_no_grant";
        ownershipConflict?: boolean;
    }>;
} | { ok: false; status: number; code: string; error: string }> {
    if (!isAppleIapVerifyRouteEnabled()) {
        return { ok: false, status: 503, code: "APPLE_IAP_DISABLED", error: "Apple IAP restore is disabled." };
    }

    const clientEnvironment = normalizeAppleIapClientEnvironment(input.environment);
    if (!clientEnvironment) {
        return { ok: false, status: 400, code: "INVALID_ENVIRONMENT", error: "environment must be Sandbox or Production." };
    }

    const signedList = Array.isArray(input.signedTransactionInfos)
        ? input.signedTransactionInfos.map((value) => String(value || "").trim()).filter(Boolean)
        : [];

    if (signedList.length === 0) {
        return { ok: false, status: 400, code: "MISSING_TRANSACTIONS", error: "signedTransactionInfos is required." };
    }

    const commerceLocked = isPublicBetaCommerceLocked();
    const restored: Array<{
        transactionId: string;
        originalTransactionId: string;
        appleProductId: string;
        duplicate?: boolean;
        outcome: typeof APPLE_IAP_STAGE1_VERIFY_OUTCOME | "restored_no_grant";
        ownershipConflict?: boolean;
    }> = [];

    for (const signedTransactionInfo of signedList) {
        let verified;
        try {
            verified = await verifyAppleSignedTransactionInfo(signedTransactionInfo, clientEnvironment);
        } catch (error) {
            if (isAppleJwsVerificationError(error)) {
                return { ok: false, status: 422, code: "JWS_VERIFICATION_FAILED", error: "Apple restore transaction verification failed." };
            }
            return { ok: false, status: 422, code: "JWS_VERIFICATION_FAILED", error: "Apple restore transaction could not be verified." };
        }

        const tokenCheck = validateAppAccountTokenForUser(verified.appAccountToken, input.userId);
        if (!tokenCheck.ok) {
            restored.push({
                transactionId: verified.transactionId,
                originalTransactionId: verified.originalTransactionId,
                appleProductId: verified.productId,
                outcome: "restored_no_grant",
                ownershipConflict: true,
            });
            continue;
        }

        const priorOwner = await fetchApplePaymentOwnerByOriginalTransactionId(supabase, verified.originalTransactionId);
        if (!priorOwner.ok) {
            return { ok: false, status: 500, code: "OWNERSHIP_LOOKUP_FAILED", error: priorOwner.error };
        }
        const ownership = assertTransactionOwnershipAllowed(priorOwner.userId, input.userId);
        if (!ownership.ok) {
            restored.push({
                transactionId: verified.transactionId,
                originalTransactionId: verified.originalTransactionId,
                appleProductId: verified.productId,
                outcome: "restored_no_grant",
                ownershipConflict: true,
            });
            continue;
        }

        const skuResult = await resolveAppleCatalogSku(supabase, verified.productId);
        if (!skuResult.ok) {
            return {
                ok: false,
                status: skuResult.code === "UNKNOWN_SKU" ? 422 : 500,
                code: skuResult.code === "UNKNOWN_SKU" ? "UNKNOWN_APPLE_SKU" : "APPLE_CATALOG_ERROR",
                error: skuResult.error,
            };
        }

        const insertResult = await insertApplePaymentEvent(supabase, {
            providerEventId: verified.transactionId,
            originalTransactionId: verified.originalTransactionId,
            notificationType: "restore",
            userId: input.userId,
            appleProductId: verified.productId,
            environment: clientEnvironment,
            payloadHash: hashAppleSignedPayload(signedTransactionInfo),
            outcome: "restored_no_grant",
            commerceLocked,
            payload: {
                transactionId: verified.transactionId,
                originalTransactionId: verified.originalTransactionId,
                productId: verified.productId,
            },
        });

        if (!insertResult.ok) {
            return {
                ok: false,
                status: insertResult.setupRequired ? 503 : 500,
                code: insertResult.setupRequired ? "APPLE_IAP_SETUP_REQUIRED" : "RESTORE_EVENT_PERSIST_FAILED",
                error: insertResult.error,
            };
        }

        await fulfillVerifiedAppleTransactionIfAllowed({
            supabase,
            userId: input.userId,
            sku: skuResult.sku,
            transaction: verified,
        });

        restored.push({
            transactionId: verified.transactionId,
            originalTransactionId: verified.originalTransactionId,
            appleProductId: verified.productId,
            duplicate: !insertResult.inserted && insertResult.duplicate ? true : undefined,
            outcome: "restored_no_grant",
        });
    }

    return {
        ok: true,
        commerceLocked,
        entitlementsGranted: false,
        restored,
    };
}
