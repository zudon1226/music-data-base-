/**
 * Validate Apple root CA DER files (fingerprints + X509 parse).
 * Usage: node scripts/validate-apple-root-certificates.mjs
 */
import { X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const certDir = join(root, "lib/apple/certs");

/** SHA-256 fingerprints from node X509Certificate (colons stripped for compare). */
const EXPECTED = {
    "AppleRootCA-G3.cer": "63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179",
    "AppleIncRootCertificate.cer": "B0B1730ECBC7FF4505142C49F1295E6EDA6BCAED7E2C68C5BE91B5A11001F024",
    "AppleRootCA-G2.cer": "C2B9B042DD57830E7D117DAC55AC8AE19407D38E41D88F3215BC3A890444A050",
};

function normalizeFingerprint(value) {
    return String(value || "").replace(/:/g, "").toUpperCase();
}

function record(ok, label, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

for (const [fileName, expectedSha256] of Object.entries(EXPECTED)) {
    const path = join(certDir, fileName);
    record(existsSync(path), `${fileName} exists`);
    if (!existsSync(path)) continue;
    const der = readFileSync(path);
    record(der.length > 100, `${fileName} DER size`, `${der.length} bytes`);
    let cert;
    try {
        cert = new X509Certificate(der);
    } catch (error) {
        record(false, `${fileName} X509 parse`, String(error));
        continue;
    }
    const fp = normalizeFingerprint(cert.fingerprint256);
    record(fp === expectedSha256, `${fileName} sha256 fingerprint`, fp);
    record(Boolean(cert.subject), `${fileName} subject`, cert.subject.split("\n")[0]);
}

const REAL_APPLE_G3_DER = Buffer.from(
    "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==",
    "base64",
);
const bundledG3 = readFileSync(join(certDir, "AppleRootCA-G3.cer"));
record(
    Buffer.compare(bundledG3, REAL_APPLE_G3_DER) === 0,
    "bundled G3 matches Apple library reference DER",
);

if (process.exitCode) {
    console.error("\nApple root certificate validation failed.");
} else {
    console.log("\nApple root certificate validation passed.");
}
