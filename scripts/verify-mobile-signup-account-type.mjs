/**
 * Mobile signup account-type layout checks.
 * Usage: node scripts/verify-mobile-signup-account-type.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function main() {
    const page = read("app/page.tsx");
    const authCssStart = page.indexOf(".auth-form input");
    const authSlice = authCssStart >= 0 ? page.slice(authCssStart, authCssStart + 3500) : "";

    record(
        "email/password inputs use 16px to prevent iPhone focus zoom",
        /\.auth-form input\s*\{[^}]*font-size:\s*16px/s.test(authSlice),
    );

    record(
        "account-type grid is two-column with one-column fallback",
        authSlice.includes("grid-template-columns: 1fr 1fr")
            && authSlice.includes("@media (max-width: 360px)")
            && /@media \(max-width:\s*360px\)\s*\{[^}]*grid-template-columns:\s*1fr/s.test(authSlice),
    );

    record(
        "account-type options have comfortable touch targets",
        /\.auth-account-type-option\s*\{[^}]*min-height:\s*44px/s.test(authSlice),
    );

    record(
        "language selector remains on auth page",
        page.includes('<LanguageSelector compact className="auth-language-selector"/>'),
    );

    record(
        "Sign Up / Login controls remain in auth form flow",
        page.includes('authMode === "signup" ? t("auth.signUp") : t("auth.login")')
            && page.includes('authMode === "signup" ? t("auth.switchToLogin") : t("auth.switchToSignup")'),
    );

    writeFileSync(
        path.join(evidenceDir, "mobile-signup-account-type-evidence.json"),
        JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nMOBILE_SIGNUP_ACCOUNT_TYPE_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main();
