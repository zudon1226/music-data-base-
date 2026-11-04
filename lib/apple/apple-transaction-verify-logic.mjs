import { createHash } from "node:crypto";
import { PUBLIC_BETA_COMMERCE_LOCK_CODE } from "../public-beta-commerce-lock.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const APPLE_IAP_STAGE1_VERIFY_OUTCOME = "verified_no_grant";

function isUuid(value) {
    return UUID_RE.test(String(value || "").trim());
}

export function hashAppleSignedPayload(signedTransactionInfo) {
    return createHash("sha256").update(String(signedTransactionInfo || "").trim()).digest("hex");
}

export function normalizeAppAccountToken(value) {
    const trimmed = String(value || "").trim().toLowerCase();
    return trimmed || null;
}

export function validateAppAccountTokenForUser(appAccountToken, userId) {
    const token = normalizeAppAccountToken(appAccountToken);
    if (!token) return { ok: true };
    if (!isUuid(token)) {
        return { ok: false, code: "APP_ACCOUNT_TOKEN_INVALID", error: "Invalid app account token." };
    }
    if (token !== userId.trim().toLowerCase()) {
        return {
            ok: false,
            code: "APP_ACCOUNT_TOKEN_MISMATCH",
            error: "App account token does not match the authenticated user.",
        };
    }
    return { ok: true };
}

export function assertTransactionOwnershipAllowed(existingUserId, userId) {
    const prior = String(existingUserId || "").trim().toLowerCase();
    const current = userId.trim().toLowerCase();
    if (prior && prior !== current) {
        return {
            ok: false,
            code: "TRANSACTION_OWNERSHIP_CONFLICT",
            error: "This Apple transaction is already bound to another account.",
        };
    }
    return { ok: true };
}

export function shouldRejectSandboxAppleVerifyInProduction(clientEnvironment, isProductionRuntime) {
    return isProductionRuntime && clientEnvironment === "Sandbox";
}

export function resolveStage1AppleVerifyOutcome(commerceLocked) {
    return {
        outcome: APPLE_IAP_STAGE1_VERIFY_OUTCOME,
        entitlementsGranted: false,
        commerceLocked,
        code: commerceLocked ? PUBLIC_BETA_COMMERCE_LOCK_CODE : undefined,
    };
}

export function buildMappedEntityFromSku(sku) {
    return {
        entityType: sku.entity_type,
        entityId: sku.entity_id,
        planSlug: sku.plan_slug,
        licenseType: sku.license_type,
        billingInterval: sku.billing_interval,
    };
}
