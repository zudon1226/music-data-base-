import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicBetaCommerceLocked } from "../public-beta-commerce-lock";
import { insertApplePaymentEvent } from "./apple-payment-events";
import { resolveAppleCatalogSku } from "./apple-sku-registry";
import {
    assertTransactionOwnershipAllowed,
    buildMappedEntityFromSku,
    hashAppleSignedPayload,
    resolveStage1AppleVerifyOutcome,
    shouldRejectSandboxAppleVerifyInProduction,
    validateAppAccountTokenForUser,
} from "./apple-transaction-verify-logic";
import { isAppleJwsVerificationError, verifyAppleSignedTransactionInfo, type VerifiedAppleTransaction } from "./app-store-jws";
import {
    isAppleIapVerifyRouteEnabled,
    isProductionAppleIapRuntime,
    normalizeAppleIapClientEnvironment,
    type AppleIapClientEnvironment,
} from "./app-store-config";
import { APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED, APPLE_IAP_STAGE1_VERIFY_OUTCOME } from "./apple-iap-stage1";

export type VerifyAppleTransactionRequest = {
    userId: string;
    signedTransactionInfo: string;
    environment: string;
};

export type VerifyAppleTransactionSuccess = {
    ok: true;
    verified: true;
    duplicate?: boolean;
    setupRequired?: boolean;
    commerceLocked: boolean;
    entitlementsGranted: false;
    code?: string;
    transactionId: string;
    originalTransactionId: string;
    appleProductId: string;
    mappedEntity: ReturnType<typeof buildMappedEntityFromSku>;
    outcome: typeof APPLE_IAP_STAGE1_VERIFY_OUTCOME;
};

export type VerifyAppleTransactionFailure = {
    ok: false;
    status: number;
    code: string;
    error: string;
    verified?: false;
};

export type VerifyAppleTransactionDeps = {
    verifySignedTransaction?: (
        signedTransactionInfo: string,
        environment: AppleIapClientEnvironment,
    ) => Promise<VerifiedAppleTransaction>;
};

function buildAuditPayload(transaction: VerifiedAppleTransaction) {
    return {
        transactionId: transaction.transactionId,
        originalTransactionId: transaction.originalTransactionId,
        productId: transaction.productId,
        environment: transaction.environment,
        purchaseDate: transaction.purchaseDate ?? null,
        expiresDate: transaction.expiresDate ?? null,
    };
}

export async function verifyAppleTransactionForUser(
    supabase: SupabaseClient,
    input: VerifyAppleTransactionRequest,
    deps: VerifyAppleTransactionDeps = {},
): Promise<VerifyAppleTransactionSuccess | VerifyAppleTransactionFailure> {
    if (!isAppleIapVerifyRouteEnabled()) {
        return {
            ok: false,
            status: 503,
            code: "APPLE_IAP_VERIFY_DISABLED",
            error: "Apple transaction verification is not enabled.",
        };
    }

    const clientEnvironment = normalizeAppleIapClientEnvironment(input.environment);
    if (!clientEnvironment) {
        return {
            ok: false,
            status: 400,
            code: "INVALID_ENVIRONMENT",
            error: "environment must be Sandbox or Production.",
        };
    }

    if (shouldRejectSandboxAppleVerifyInProduction(clientEnvironment, isProductionAppleIapRuntime())) {
        return {
            ok: false,
            status: 403,
            code: "SANDBOX_NOT_ALLOWED",
            error: "Sandbox Apple transactions cannot be verified in production.",
        };
    }

    const signedTransactionInfo = String(input.signedTransactionInfo || "").trim();
    if (!signedTransactionInfo) {
        return {
            ok: false,
            status: 400,
            code: "MISSING_SIGNED_TRANSACTION",
            error: "signedTransactionInfo is required.",
        };
    }

    const verifySignedTransaction = deps.verifySignedTransaction ?? verifyAppleSignedTransactionInfo;

    let verified: VerifiedAppleTransaction;
    try {
        verified = await verifySignedTransaction(signedTransactionInfo, clientEnvironment);
    } catch (error) {
        if (isAppleJwsVerificationError(error)) {
            return {
                ok: false,
                status: 422,
                code: "JWS_VERIFICATION_FAILED",
                error: "Apple transaction signature verification failed.",
                verified: false,
            };
        }
        return {
            ok: false,
            status: 422,
            code: "JWS_VERIFICATION_FAILED",
            error: "Apple transaction could not be verified.",
            verified: false,
        };
    }

    const tokenCheck = validateAppAccountTokenForUser(verified.appAccountToken, input.userId);
    if (!tokenCheck.ok) {
        return {
            ok: false,
            status: 403,
            code: String(tokenCheck.code || "APP_ACCOUNT_TOKEN_INVALID"),
            error: String(tokenCheck.error || "App account token validation failed."),
            verified: false,
        };
    }

    const skuResult = await resolveAppleCatalogSku(supabase, verified.productId);
    if (!skuResult.ok) {
        const status = skuResult.code === "DB_ERROR" ? 500 : 422;
        return {
            ok: false,
            status,
            code: skuResult.code === "UNKNOWN_SKU" ? "UNKNOWN_APPLE_SKU" : "APPLE_CATALOG_ERROR",
            error: skuResult.error,
            verified: false,
        };
    }

    if (verified.productId !== skuResult.sku.apple_product_id) {
        return {
            ok: false,
            status: 422,
            code: "SKU_MISMATCH",
            error: "Verified product id does not match catalog.",
            verified: false,
        };
    }

    const commerceLocked = isPublicBetaCommerceLocked();
    const payloadHash = hashAppleSignedPayload(signedTransactionInfo);
    const stage1 = resolveStage1AppleVerifyOutcome(commerceLocked);

    const insertResult = await insertApplePaymentEvent(supabase, {
        providerEventId: verified.transactionId,
        originalTransactionId: verified.originalTransactionId,
        notificationType: "client_verify",
        userId: input.userId,
        appleProductId: verified.productId,
        environment: clientEnvironment,
        payloadHash,
        outcome: APPLE_IAP_STAGE1_VERIFY_OUTCOME,
        commerceLocked,
        payload: buildAuditPayload(verified),
    });

    if (!insertResult.ok) {
        return {
            ok: false,
            status: insertResult.setupRequired ? 503 : 500,
            code: insertResult.setupRequired ? "APPLE_IAP_SETUP_REQUIRED" : "APPLE_EVENT_PERSIST_FAILED",
            error: insertResult.error,
        };
    }

    if (!insertResult.inserted && insertResult.duplicate) {
        const ownership = assertTransactionOwnershipAllowed(insertResult.row?.user_id, input.userId);
        if (!ownership.ok) {
            return {
                ok: false,
                status: 409,
                code: String(ownership.code || "TRANSACTION_OWNERSHIP_CONFLICT"),
                error: String(ownership.error || "Transaction ownership conflict."),
            };
        }
        return {
            ok: true,
            verified: true,
            duplicate: true,
            setupRequired: false,
            commerceLocked,
            entitlementsGranted: false,
            code: commerceLocked ? stage1.code : undefined,
            transactionId: verified.transactionId,
            originalTransactionId: verified.originalTransactionId,
            appleProductId: verified.productId,
            mappedEntity: buildMappedEntityFromSku(skuResult.sku),
            outcome: APPLE_IAP_STAGE1_VERIFY_OUTCOME,
        };
    }

    if (APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED) {
        // Stage 1 never calls fulfillment — entitlementsGranted stays false even when commerce lock is off.
    }

    return {
        ok: true,
        verified: true,
        setupRequired: false,
        commerceLocked,
        entitlementsGranted: false,
        code: commerceLocked ? stage1.code : undefined,
        transactionId: verified.transactionId,
        originalTransactionId: verified.originalTransactionId,
        appleProductId: verified.productId,
        mappedEntity: buildMappedEntityFromSku(skuResult.sku),
        outcome: APPLE_IAP_STAGE1_VERIFY_OUTCOME,
    };
}
