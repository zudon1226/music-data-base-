import { VerificationException, VerificationStatus } from "@apple/app-store-server-library";
import type { AppleIapClientEnvironment } from "./app-store-config";
import { isProductionAppleIapRuntime } from "./app-store-config";

function normalizeApplePayloadEnvironment(value: string | undefined): AppleIapClientEnvironment | null {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "sandbox") return "Sandbox";
    if (normalized === "production") return "Production";
    return null;
}

/** Reject Sandbox JWS in production runtime or when client claims Production. */
export function assertVerifiedAppleEnvironmentAllowed(
    payloadEnvironment: string | undefined,
    clientEnvironment: AppleIapClientEnvironment,
) {
    if (!String(payloadEnvironment || "").trim()) {
        return;
    }
    const decodedEnvironment = normalizeApplePayloadEnvironment(payloadEnvironment);
    if (!decodedEnvironment) {
        throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
    }
    if (decodedEnvironment !== clientEnvironment) {
        throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
    }
    if (isProductionAppleIapRuntime() && decodedEnvironment === "Sandbox") {
        throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
    }
    if (clientEnvironment === "Production" && decodedEnvironment === "Sandbox") {
        throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
    }
}
