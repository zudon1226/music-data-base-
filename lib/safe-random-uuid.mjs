/**
 * Browser- and runtime-safe UUID v4 generator (ESM for Node scripts).
 * Keep in sync with lib/safe-random-uuid.ts.
 */
function bytesToUuidV4(bytes) {
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mathRandomUuidV4() {
    const bytes = new Uint8Array(16);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
    }
    return bytesToUuidV4(bytes);
}

export function safeRandomUUID() {
    const webCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

    if (webCrypto && typeof webCrypto.randomUUID === "function") {
        return webCrypto.randomUUID();
    }

    if (webCrypto && typeof webCrypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        webCrypto.getRandomValues(bytes);
        return bytesToUuidV4(bytes);
    }

    return mathRandomUuidV4();
}
