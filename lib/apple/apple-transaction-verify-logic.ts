import type { AppleIapClientEnvironment } from "./app-store-config";
import {
    APPLE_IAP_STAGE1_VERIFY_OUTCOME,
    assertTransactionOwnershipAllowed,
    buildMappedEntityFromSku,
    hashAppleSignedPayload,
    normalizeAppAccountToken,
    resolveStage1AppleVerifyOutcome,
    shouldRejectSandboxAppleVerifyInProduction,
    validateAppAccountTokenForUser,
} from "./apple-transaction-verify-logic.mjs";

export type AppleCatalogEntityType = "subscription" | "album" | "ringtone" | "beat_license";

export type AppleCatalogSkuRow = {
    apple_product_id: string;
    entity_type: AppleCatalogEntityType;
    entity_id: string | null;
    plan_slug: string | null;
    license_type: string | null;
    billing_interval: string | null;
    active: boolean;
};

export {
    APPLE_IAP_STAGE1_VERIFY_OUTCOME,
    assertTransactionOwnershipAllowed,
    buildMappedEntityFromSku,
    hashAppleSignedPayload,
    normalizeAppAccountToken,
    resolveStage1AppleVerifyOutcome,
    shouldRejectSandboxAppleVerifyInProduction,
    validateAppAccountTokenForUser,
};
