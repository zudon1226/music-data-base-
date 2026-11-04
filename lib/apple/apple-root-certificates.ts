import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Apple PKI roots used by App Store signed-data verification (G3 required; Inc root recommended). */
const CERT_FILES = [
    "AppleRootCA-G3.cer",
    "AppleIncRootCertificate.cer",
    "AppleRootCA-G2.cer",
] as const;

/** DER-encoded Apple root certificates for JWS chain validation. */
export function loadAppleRootCertificates(): Buffer[] {
    const certDir = join(process.cwd(), "lib", "apple", "certs");
    const buffers: Buffer[] = [];
    for (const fileName of CERT_FILES) {
        const filePath = join(certDir, fileName);
        if (!existsSync(filePath)) continue;
        buffers.push(readFileSync(filePath));
    }
    if (buffers.length === 0) {
        throw new Error("Apple root CA certificates are missing from lib/apple/certs.");
    }
    return buffers;
}
