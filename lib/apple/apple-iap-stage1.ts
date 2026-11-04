import { APPLE_IAP_STAGE1_VERIFY_OUTCOME as STAGE1_OUTCOME } from "./apple-transaction-verify-logic.mjs";

/** Stage 1 server foundation — verification and audit only; no entitlement grants. */
export const APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED = true;

export const APPLE_IAP_STAGE1_VERIFY_OUTCOME = STAGE1_OUTCOME;
