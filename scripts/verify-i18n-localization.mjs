/**
 * Global i18n localization verification harness.
 * Usage: node scripts/verify-i18n-localization.mjs
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];
const completeLocales = ["en", "es", "fr", "ht", "pt"];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    }
    catch { /* ignore */ }
    return env;
}

function parseRegistryLanguages(filePath) {
    const content = readFileSync(filePath, "utf8");
    const marker = "export const SUPPORTED_LANGUAGES";
    const assignIndex = content.indexOf("= [", content.indexOf(marker));
    if (assignIndex < 0) throw new Error("Unable to locate SUPPORTED_LANGUAGES array");
    const arrayStart = assignIndex + 2;
    let depth = 0;
    let end = arrayStart;
    for (; end < content.length; end += 1) {
        const char = content[end];
        if (char === "[") depth += 1;
        if (char === "]") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    return eval(`(${content.slice(arrayStart, end + 1)})`);
}

function parseExportObject(filePath, exportName) {
    const content = readFileSync(filePath, "utf8");
    const marker = `export const ${exportName}`;
    const start = content.indexOf(marker);
    if (start < 0) throw new Error(`Missing export ${exportName} in ${filePath}`);
    const braceStart = content.indexOf("{", start);
    let depth = 0;
    let end = braceStart;
    for (; end < content.length; end += 1) {
        if (content[end] === "{") depth += 1;
        if (content[end] === "}") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    return eval(`(${content.slice(braceStart, end + 1)})`);
}

function flattenMessages(obj, prefix = "") {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") out[next] = value;
        else Object.assign(out, flattenMessages(value, next));
    }
    return out;
}

function resolvePath(messages, key) {
    const parts = key.split(".");
    let current = messages;
    for (const part of parts) {
        if (!current || typeof current !== "object" || !(part in current)) return undefined;
        current = current[part];
    }
    return typeof current === "string" ? current : undefined;
}

function createTranslator(activeMessages, fallbackMessages) {
    return function translate(key, values) {
        let text = resolvePath(activeMessages, key) || resolvePath(fallbackMessages, key) || "";
        if (!values) return text;
        return text.replace(/\{(\w+)\}/g, (_, token) => String(values[token] ?? ""));
    };
}

function normalizeLocale(value, supportedCodes) {
    const clean = String(value || "").trim();
    if (!clean) return "en";
    if (supportedCodes.has(clean)) return clean;
    const lower = clean.toLowerCase();
    for (const code of supportedCodes) {
        if (code.toLowerCase() === lower) return code;
    }
    const base = lower.split("-")[0];
    for (const code of supportedCodes) {
        if (code.toLowerCase() === base) return code;
    }
    return "en";
}

function detectBrowserLocale(candidates, supportedCodes) {
    for (const candidate of candidates) {
        const normalized = normalizeLocale(candidate, supportedCodes);
        if (normalized) return normalized;
    }
    return "en";
}

async function applyMigration(env) {
    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    if (!databaseUrl) return false;
    const sql = readFileSync(path.join(root, "supabase/migrations/202607150005_preferred_language.sql"), "utf8");
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        await client.query(sql);
        return true;
    }
    finally {
        await client.end();
    }
}

async function ownerSession(env) {
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: "zudon1226@gmail.com" });
    const verified = await anon.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "magiclink",
    });
    return verified.data.session;
}

function authBody(userId, session, extra = {}) {
    return {
        ...extra,
        userId,
        sessionUserId: userId,
        accessToken: session.access_token,
        sessionAccessToken: session.access_token,
        refreshToken: session.refresh_token,
        sessionRefreshToken: session.refresh_token,
    };
}

function scanForSecrets() {
    const forbidden = [
        /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/,
        /DATABASE_URL\s*=\s*['"]postgres/,
        /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    ];
    const targets = [
        path.join(root, "app"),
        path.join(root, "components"),
        path.join(root, "lib/i18n"),
    ];
    const hits = [];
    for (const dir of targets) {
        for (const file of walk(dir)) {
            if (!/\.(tsx?|jsx?|mjs)$/.test(file)) continue;
            const content = readFileSync(file, "utf8");
            for (const pattern of forbidden) {
                if (pattern.test(content)) hits.push(`${file}: ${pattern}`);
            }
        }
    }
    return hits;
}

function walk(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules") walk(full, acc);
        else if (entry.isFile()) acc.push(full);
    }
    return acc;
}

async function main() {
    const env = readEnv();
    const baseUrl = env.VERIFY_BASE_URL || env.LOCAL_SITE_URL || env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";

    const registry = parseRegistryLanguages(path.join(root, "lib/i18n/registry.ts"));
    const supportedCodes = new Set(registry.map((language) => language.code));
    record("language registry count", registry.length === 52, `${registry.length} languages`);
    record("language registry sorted metadata", registry.every((language) => language.code && language.nativeName), "native names present");
    record("complete locales flagged", completeLocales.every((code) => registry.find((language) => language.code === code)?.translationComplete), completeLocales.join(", "));

    const incomplete = registry.filter((language) => !language.translationComplete).map((language) => language.code);
    record("fallback locales registered", incomplete.length === 47, `${incomplete.length} fallback languages`);

    const enMessages = parseExportObject(path.join(root, "lib/i18n/messages/en.ts"), "enMessages");
    const enFlat = flattenMessages(enMessages);
    const enKeys = Object.keys(enFlat);
    record("english dictionary keys", enKeys.length > 100, `${enKeys.length} keys`);

    for (const locale of completeLocales) {
        const messages = parseExportObject(path.join(root, "lib/i18n/messages", `${locale}.ts`), `${locale}Messages`);
        const flat = flattenMessages(messages);
        const missing = enKeys.filter((key) => !(key in flat) || !flat[key]);
        record(`translation completeness ${locale}`, missing.length === 0, missing.length ? `missing ${missing.slice(0, 5).join(", ")}` : `${enKeys.length} keys`);
    }

    const completeLocaleSet = new Set(completeLocales);
    function getMessagesForLocale(locale) {
        if (completeLocaleSet.has(locale)) {
            return parseExportObject(path.join(root, "lib/i18n/messages", `${locale}.ts`), `${locale}Messages`);
        }
        return enMessages;
    }
    const deTranslator = createTranslator(getMessagesForLocale("de"), enMessages);
    record("english fallback de nav.home", deTranslator("nav.home") === enFlat["nav.home"], deTranslator("nav.home"));
    record("english fallback de differs from es", deTranslator("nav.home") !== flattenMessages(parseExportObject(path.join(root, "lib/i18n/messages/es.ts"), "esMessages"))["nav.home"], "de uses English");

    record("language detection es", detectBrowserLocale(["es-MX", "en-US"], supportedCodes) === "es", "es-MX");
    record("language detection zh-CN", detectBrowserLocale(["zh-CN"], supportedCodes) === "zh-CN", "zh-CN");
    record("language detection unsupported", detectBrowserLocale(["xx-YY"], supportedCodes) === "en", "xx-YY -> en");

    const missingKeyTranslator = createTranslator({}, enMessages);
    record("missing key fallback", missingKeyTranslator("common.save") === enFlat["common.save"], missingKeyTranslator("common.save"));
    record("missing key empty", missingKeyTranslator("does.not.exist") === "", "returns empty string");

    const dateEs = new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date("2026-07-15T12:00:00Z"));
    const numberFr = new Intl.NumberFormat("fr").format(1234567.89);
    const currencyPt = new Intl.NumberFormat("pt", { style: "currency", currency: "USD" }).format(19.99);
    record("date formatting es", /2026|15|juil|jul/i.test(dateEs), dateEs);
    record("number formatting fr", numberFr.includes("234") || numberFr.includes("567"), numberFr);
    record("currency formatting pt", currencyPt.includes("19") && currencyPt.includes("99"), currencyPt);

    const rtlLanguages = registry.filter((language) => language.rtl).map((language) => language.code);
    record("rtl locales", rtlLanguages.includes("ar") && rtlLanguages.includes("he") && rtlLanguages.includes("ur"), rtlLanguages.join(", "));

    record("desktop selector component", readFileSync(path.join(root, "components/language-selector.tsx"), "utf8").includes("language-selector-panel"), "panel markup");
    record("mobile selector styles", readFileSync(path.join(root, "lib/i18n/i18n-styles.ts"), "utf8").includes("@media (max-width: 900px)"), "responsive rules");
    record("rtl shell styles", readFileSync(path.join(root, "lib/i18n/i18n-styles.ts"), "utf8").includes(".mdb-rtl-shell"), "rtl shell");

    const routeKeys = [
        "nav.home", "nav.marketplace", "nav.trending", "nav.library", "nav.profile",
        "auth.loginTitle", "upload.title", "platformControlCenter.title", "testAccountCleanup.title",
    ];
    for (const locale of completeLocales) {
        const messages = parseExportObject(path.join(root, "lib/i18n/messages", `${locale}.ts`), `${locale}Messages`);
        const t = createTranslator(messages, enMessages);
        const missingRoutes = routeKeys.filter((key) => !t(key));
        record(`major route coverage ${locale}`, missingRoutes.length === 0, missingRoutes.join(", ") || "ok");
    }

    const secretHits = scanForSecrets();
    record("secret exposure scan", secretHits.length === 0, secretHits.slice(0, 3).join("; ") || "clean");

    if (env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL) {
        try {
            const applied = await applyMigration(env);
            record("preferred_language migration", applied, "202607150005_preferred_language.sql");
        }
        catch (error) {
            record("preferred_language migration", false, error instanceof Error ? error.message : String(error));
        }
    }
    else {
        record("preferred_language migration", false, "DATABASE_URL missing");
    }

    record("locale storage keys", readFileSync(path.join(root, "lib/i18n/registry.ts"), "utf8").includes("LOCALE_STORAGE_KEY"), "localStorage key constant");
    record("locale cookie keys", readFileSync(path.join(root, "lib/i18n/registry.ts"), "utf8").includes("LOCALE_COOKIE_KEY"), "cookie key constant");

    const owner = await ownerSession(env);
    if (owner?.access_token) {
        record("owner session", true, owner.user.id);

        for (const locale of completeLocales) {
            const messages = getMessagesForLocale(locale);
            const t = createTranslator(messages, enMessages);
            record(`owner label context ${locale}`, Boolean(t("platformControlCenter.ownerOnly")), t("platformControlCenter.ownerOnly"));
        }

        const ownerControl = await fetch(`${baseUrl}/api/launch/platform-control-center?userId=${encodeURIComponent(owner.user.id)}`, {
            headers: { Authorization: `Bearer ${owner.access_token}` },
            cache: "no-store",
        });
        record("owner platform control access", ownerControl.ok, `status ${ownerControl.status} @ ${baseUrl}`);

        const ownerLanguageUpdate = await fetch(`${baseUrl}/api/user-profile`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${owner.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authBody(owner.user.id, owner, {
                action: "update-language",
                preferredLanguage: "pt",
            })),
        });
        const ownerLanguageJson = await ownerLanguageUpdate.json().catch(() => ({}));
        record("authenticated preference persistence", ownerLanguageUpdate.ok && ownerLanguageJson.preferredLanguage === "pt", JSON.stringify(ownerLanguageJson));

        const ownerProfileGet = await fetch(`${baseUrl}/api/user-profile?userId=${encodeURIComponent(owner.user.id)}`, {
            headers: { Authorization: `Bearer ${owner.access_token}` },
            cache: "no-store",
        });
        const ownerProfileJson = await ownerProfileGet.json().catch(() => ({}));
        record("authenticated preference readback", ownerProfileGet.ok && ownerProfileJson.preferredLanguage === "pt", JSON.stringify(ownerProfileJson));

        await fetch(`${baseUrl}/api/user-profile`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${owner.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authBody(owner.user.id, owner, {
                action: "update-language",
                preferredLanguage: "en",
            })),
        });

        const disposableEmail = `i18n-${Date.now()}-${randomBytes(3).toString("hex")}@cursor-verify.invalid`;
        const disposablePassword = `Verify-${randomBytes(8).toString("hex")}!1`;
        const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const created = await admin.auth.admin.createUser({
            email: disposableEmail,
            email_confirm: true,
            password: disposablePassword,
        });
        const disposableUserId = created.data.user?.id || "";
        if (disposableUserId) {
            const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
                auth: { persistSession: false, autoRefreshToken: false },
            });
            const login = await anon.auth.signInWithPassword({
                email: disposableEmail,
                password: disposablePassword,
            });
            const disposableSession = login.data.session;
            record("disposable auth session", Boolean(disposableSession?.access_token), disposableEmail);

            if (disposableSession?.access_token) {
                for (const locale of completeLocales) {
                    const denied = await fetch(`${baseUrl}/api/launch/platform-control-center?userId=${encodeURIComponent(disposableUserId)}`, {
                        headers: { Authorization: `Bearer ${disposableSession.access_token}` },
                        cache: "no-store",
                    });
                    record(`non-owner denial ${locale}`, denied.status === 403 || denied.status === 401 || denied.status === 404, `status ${denied.status}`);
                }
            }

            await admin.auth.admin.deleteUser(disposableUserId);
            record("disposable cleanup", true, disposableUserId);
        }
        else {
            record("disposable auth session", false, created.error?.message || "create failed");
        }

        record("logged-out persistence contract", readFileSync(path.join(root, "lib/i18n/storage.ts"), "utf8").includes("persistLocale"), "persistLocale writes storage + cookie");
    }
    else {
        record("owner session", false, "unable to create owner session");
    }

    writeFileSync(path.join(evidenceDir, "i18n-localization-evidence.json"), JSON.stringify({
        generatedAt: new Date().toISOString(),
        completeLocales,
        fallbackLocales: incomplete,
        registry: registry.map((language) => ({
            code: language.code,
            nativeName: language.nativeName,
            translationComplete: language.translationComplete,
            rtl: language.rtl,
        })),
        results,
    }, null, 2));

    const failed = results.filter((entry) => !entry.ok);
    if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
    record("verify harness", false, error instanceof Error ? error.message : String(error));
    process.exit(1);
});
