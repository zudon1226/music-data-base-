import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponseBodyV2DecodedPayload } from "@apple/app-store-server-library";
import { isPublicBetaCommerceLocked } from "../public-beta-commerce-lock";
import {
    fetchApplePaymentOwnerByOriginalTransactionId,
    insertApplePaymentEvent,
} from "./apple-payment-events";
import { fulfillVerifiedAppleTransactionIfAllowed } from "./apple-fulfillment-router";
import { isAppleJwsVerificationError, verifyAppleSignedNotificationPayload, verifyAppleSignedTransactionInfo } from "./app-store-jws";
import {
    isAppleIapVerifyRouteEnabled,
    normalizeAppleIapClientEnvironment,
} from "./app-store-config";
import { resolveAppleCatalogSku } from "./apple-sku-registry";

function hashPayload(value: string) {
    return createHash("sha256").update(String(value || "").trim()).digest("hex");
}

function resolveAsnOutcome(notificationType: string | undefined, subtype: string | undefined) {
    const type = String(notificationType || "").toUpperCase();
    const sub = String(subtype || "").toUpperCase();
    if (type.includes("REFUND") || type.includes("REVOKE") || sub.includes("REFUND")) {
        return "revoked_no_grant" as const;
    }
    return "asn_no_grant" as const;
}

function buildSafeAsnAuditPayload(decoded: ResponseBodyV2DecodedPayload) {
    return {
        notificationType: decoded.notificationType ?? null,
        subtype: decoded.subtype ?? null,
        notificationUUID: decoded.notificationUUID ?? null,
        bundleId: decoded.data?.bundleId ?? null,
        environment: decoded.data?.environment ?? null,
        status: decoded.data?.status ?? null,
    };
}

export async function processAppleServerNotification(
    supabase: SupabaseClient,
    signedPayload: string,
    environmentInput: string,
): Promise<
    | { ok: true; duplicate?: boolean; entitlementsGranted: false; notificationUUID: string; outcome: string }
    | { ok: false; status: number; code: string; error: string }
> {
    if (!isAppleIapVerifyRouteEnabled()) {
        return { ok: false, status: 503, code: "APPLE_IAP_DISABLED", error: "Apple IAP processing is disabled." };
    }

    const clientEnvironment = normalizeAppleIapClientEnvironment(environmentInput);
    if (!clientEnvironment) {
        return { ok: false, status: 400, code: "INVALID_ENVIRONMENT", error: "environment must be Sandbox or Production." };
    }

    let decoded: ResponseBodyV2DecodedPayload;
    try {
        decoded = await verifyAppleSignedNotificationPayload(signedPayload, clientEnvironment);
    } catch (error) {
        if (isAppleJwsVerificationError(error)) {
            return { ok: false, status: 422, code: "ASN_SIGNATURE_FAILED", error: "Apple notification signature verification failed." };
        }
        return { ok: false, status: 422, code: "ASN_SIGNATURE_FAILED", error: "Apple notification could not be verified." };
    }

    const notificationUUID = String(decoded.notificationUUID || "").trim();
    if (!notificationUUID) {
        return { ok: false, status: 422, code: "MISSING_NOTIFICATION_UUID", error: "Notification UUID is required." };
    }

    const signedTransactionInfo = String(decoded.data?.signedTransactionInfo || "").trim();
    let appleProductId = "unknown";
    let originalTransactionId = "";
    let resolvedUserId: string | null = null;

    if (signedTransactionInfo) {
        try {
            const verified = await verifyAppleSignedTransactionInfo(signedTransactionInfo, clientEnvironment);
            appleProductId = verified.productId;
            originalTransactionId = verified.originalTransactionId;
            if (verified.appAccountToken) {
                resolvedUserId = verified.appAccountToken.trim().toLowerCase();
            }
        } catch {
            appleProductId = "unknown";
        }
    }

    if (originalTransactionId) {
        const owner = await fetchApplePaymentOwnerByOriginalTransactionId(supabase, originalTransactionId);
        if (owner.ok && owner.userId) {
            if (resolvedUserId && owner.userId !== resolvedUserId) {
                return {
                    ok: false,
                    status: 409,
                    code: "ORIGINAL_TRANSACTION_OWNERSHIP_CONFLICT",
                    error: "Original transaction is bound to another MDB account.",
                };
            }
            resolvedUserId = owner.userId;
        }
    }

    const commerceLocked = isPublicBetaCommerceLocked();
    const outcome = resolveAsnOutcome(String(decoded.notificationType || ""), String(decoded.subtype || ""));

    const insertResult = await insertApplePaymentEvent(supabase, {
        providerEventId: notificationUUID,
        originalTransactionId: originalTransactionId || undefined,
        notificationType: "asn",
        userId: resolvedUserId,
        appleProductId,
        environment: clientEnvironment,
        payloadHash: hashPayload(signedPayload),
        outcome,
        commerceLocked,
        payload: buildSafeAsnAuditPayload(decoded),
    });

    if (!insertResult.ok) {
        return {
            ok: false,
            status: insertResult.setupRequired ? 503 : 500,
            code: insertResult.setupRequired ? "APPLE_IAP_SETUP_REQUIRED" : "ASN_EVENT_PERSIST_FAILED",
            error: insertResult.error,
        };
    }

    if (!insertResult.inserted && insertResult.duplicate) {
        return {
            ok: true,
            duplicate: true,
            entitlementsGranted: false,
            notificationUUID,
            outcome,
        };
    }

    if (signedTransactionInfo && appleProductId !== "unknown") {
        const sku = await resolveAppleCatalogSku(supabase, appleProductId);
        if (sku.ok && resolvedUserId) {
            const verified = await verifyAppleSignedTransactionInfo(signedTransactionInfo, clientEnvironment);
            await fulfillVerifiedAppleTransactionIfAllowed({
                supabase,
                userId: resolvedUserId,
                sku: sku.sku,
                transaction: verified,
            });
        }
    }

    return {
        ok: true,
        entitlementsGranted: false,
        notificationUUID,
        outcome,
    };
}
