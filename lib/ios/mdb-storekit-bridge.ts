import { Capacitor, registerPlugin } from "@capacitor/core";
import { isPublicBetaCommerceLocked } from "@/lib/public-beta-commerce-lock";

type MDBStoreKitPlugin = {
    getStorefrontEnvironment(): Promise<{ canMakePayments: boolean; status: string }>;
    loadProducts(options: { productIds: string[] }): Promise<{ products: Array<Record<string, unknown>> }>;
    purchaseProduct(options: {
        productId: string;
        appAccountToken?: string;
        commerceLocked?: boolean;
    }): Promise<Record<string, unknown>>;
    restorePurchases(): Promise<{ signedTransactionInfos: string[] }>;
    currentEntitlements(): Promise<{ signedTransactionInfos: string[] }>;
};

const MDBStoreKit = registerPlugin<MDBStoreKitPlugin>("MDBStoreKit");

export function isNativeIosStoreKitAvailable() {
    return Capacitor.getPlatform() === "ios";
}

export async function loadIosStoreKitProducts(productIds: string[]) {
    if (!isNativeIosStoreKitAvailable()) {
        return { ok: false as const, code: "NOT_IOS", products: [] as Record<string, unknown>[] };
    }
    const result = await MDBStoreKit.loadProducts({ productIds });
    return { ok: true as const, products: result.products || [] };
}

async function resolveNativeStoreKitCommerceLocked(input: { userId: string; accessToken?: string }) {
    if (!isPublicBetaCommerceLocked()) {
        return false;
    }
    const token = String(input.accessToken || "").trim();
    if (!token) {
        return true;
    }
    try {
        const url = new URL("/api/apple/internal-qa/storekit", window.location.origin);
        url.searchParams.set("userId", input.userId);
        const response = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            return true;
        }
        const body = (await response.json()) as { storeKitPurchaseUiUnlocked?: boolean };
        return body.storeKitPurchaseUiUnlocked === true ? false : true;
    } catch {
        return true;
    }
}

export async function purchaseIosStoreKitProduct(input: {
    productId: string;
    userId: string;
    accessToken?: string;
}) {
    if (!isNativeIosStoreKitAvailable()) {
        return { ok: false as const, code: "NOT_IOS" };
    }
    const commerceLocked = await resolveNativeStoreKitCommerceLocked(input);
    return MDBStoreKit.purchaseProduct({
        productId: input.productId,
        appAccountToken: input.userId,
        commerceLocked,
    });
}

export async function restoreIosStoreKitPurchases() {
    if (!isNativeIosStoreKitAvailable()) {
        return { ok: false as const, code: "NOT_IOS", signedTransactionInfos: [] as string[] };
    }
    const result = await MDBStoreKit.restorePurchases();
    return { ok: true as const, signedTransactionInfos: result.signedTransactionInfos || [] };
}

export async function verifyIosSignedTransactionsWithMdb(input: {
    userId: string;
    accessToken: string;
    signedTransactionInfos: string[];
    environment: "Sandbox" | "Production";
}) {
    const response = await fetch("/api/apple/transactions/restore", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.accessToken}`,
        },
        body: JSON.stringify({
            userId: input.userId,
            environment: input.environment,
            signedTransactionInfos: input.signedTransactionInfos,
        }),
    });
    return response.json();
}
