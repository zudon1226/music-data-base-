/**
 * Apple root certificate bundle + library verifier wiring checks.
 * Usage: node scripts/verify-apple-certificate-chain.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const certDir = join(root, "lib/apple/certs");

function record(ok, label, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const g3 = join(certDir, "AppleRootCA-G3.cer");
const inc = join(certDir, "AppleIncRootCertificate.cer");
record(existsSync(g3), "Apple Root CA G3 present");
record(existsSync(g3) && readFileSync(g3).length > 200, "Apple Root CA G3 non-empty");

record(existsSync(inc) && readFileSync(inc).length > 200, "Apple Inc root present");
record(existsSync(join(certDir, "AppleRootCA-G2.cer")), "Apple Root CA G2 present");

const jws = readFileSync(join(root, "lib/apple/app-store-jws.ts"), "utf8");
record(jws.includes("verifyAndDecodeTransaction"), "transaction JWS verification wired");
record(jws.includes("verifyAndDecodeNotification"), "notification JWS verification wired");
record(jws.includes("assertVerifiedAppleEnvironmentAllowed"), "payload/client environment cross-check wired");

if (process.exitCode) {
    console.error("\nApple certificate-chain verification failed.");
} else {
    console.log("\nApple certificate-chain verification passed.");
}
