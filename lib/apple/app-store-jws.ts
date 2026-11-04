import {
    Environment,
    SignedDataVerifier,
    VerificationException,
    VerificationStatus,
    type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import {
    getAppleAppStoreAppAppleId,
    getAppleAppStoreBundleId,
    type AppleIapClientEnvironment,
} from "./app-store-config";
import { loadAppleRootCertificates } from "./apple-root-certificates";
import { assertVerifiedAppleEnvironmentAllowed } from "./apple-environment-validation";
import type { ResponseBodyV2DecodedPayload } from "@apple/app-store-server-library";

export type VerifiedAppleTransaction = {
    transactionId: string;
    originalTransactionId: string;
    productId: string;
    bundleId: string;
    environment: string;
    purchaseDate?: number;
    expiresDate?: number;
    revocationDate?: number;
    appAccountToken?: string;
    raw: JWSTransactionDecodedPayload;
};

function mapClientEnvironment(environment: AppleIapClientEnvironment): Environment {
    return environment === "Production" ? Environment.PRODUCTION : Environment.SANDBOX;
}

function createVerifier(environment: AppleIapClientEnvironment): SignedDataVerifier {
    const appleRootCAs = loadAppleRootCertificates();
    const bundleId = getAppleAppStoreBundleId();
    const appAppleId = getAppleAppStoreAppAppleId();
    const enableOnlineChecks = process.env.APPLE_IAP_ENABLE_ONLINE_CERT_CHECKS === "1";
    return new SignedDataVerifier(
        appleRootCAs,
        enableOnlineChecks,
        mapClientEnvironment(environment),
        bundleId,
        environment === "Production" ? appAppleId : undefined,
    );
}

function assertBundleIdMatches(payload: JWSTransactionDecodedPayload) {
    const expected = getAppleAppStoreBundleId();
    const actual = String(payload.bundleId || "").trim();
    if (!actual || actual !== expected) {
        throw new VerificationException(VerificationStatus.INVALID_APP_IDENTIFIER);
    }
}

function normalizeVerifiedTransaction(payload: JWSTransactionDecodedPayload): VerifiedAppleTransaction {
    const transactionId = String(payload.transactionId || "").trim();
    const originalTransactionId = String(payload.originalTransactionId || transactionId).trim();
    const productId = String(payload.productId || "").trim();
    const bundleId = String(payload.bundleId || "").trim();
    if (!transactionId || !productId || !bundleId) {
        throw new VerificationException(VerificationStatus.VERIFICATION_FAILURE);
    }
    return {
        transactionId,
        originalTransactionId,
        productId,
        bundleId,
        environment: String(payload.environment || "").trim(),
        purchaseDate: payload.purchaseDate,
        expiresDate: payload.expiresDate,
        revocationDate: payload.revocationDate,
        appAccountToken: payload.appAccountToken ? String(payload.appAccountToken).trim() : undefined,
        raw: payload,
    };
}

/**
 * Verify StoreKit 2 signedTransactionInfo JWS (signature + certificate chain).
 * Never treat base64-decoded payload JSON as verified without this path.
 */
export async function verifyAppleSignedTransactionInfo(
    signedTransactionInfo: string,
    clientEnvironment: AppleIapClientEnvironment,
): Promise<VerifiedAppleTransaction> {
    const trimmed = String(signedTransactionInfo || "").trim();
    if (!trimmed || trimmed.split(".").length !== 3) {
        throw new VerificationException(VerificationStatus.VERIFICATION_FAILURE);
    }
    const verifier = createVerifier(clientEnvironment);
    const decoded = await verifier.verifyAndDecodeTransaction(trimmed);
    assertBundleIdMatches(decoded);
    assertVerifiedAppleEnvironmentAllowed(String(decoded.environment || ""), clientEnvironment);
    if (decoded.revocationDate) {
        throw new VerificationException(VerificationStatus.VERIFICATION_FAILURE);
    }
    return normalizeVerifiedTransaction(decoded);
}

export async function verifyAppleSignedNotificationPayload(
    signedPayload: string,
    clientEnvironment: AppleIapClientEnvironment,
): Promise<ResponseBodyV2DecodedPayload> {
    const trimmed = String(signedPayload || "").trim();
    if (!trimmed || trimmed.split(".").length !== 3) {
        throw new VerificationException(VerificationStatus.VERIFICATION_FAILURE);
    }
    const verifier = createVerifier(clientEnvironment);
    const decoded = await verifier.verifyAndDecodeNotification(trimmed);
    assertVerifiedAppleEnvironmentAllowed(String(decoded.data?.environment || ""), clientEnvironment);
    return decoded;
}

export function isAppleJwsVerificationError(error: unknown): error is VerificationException {
    return error instanceof VerificationException;
}
