/**
 * Static + live UI contracts for compact Test Account Cleanup Center rows.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
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

const component = read("components/test-account-cleanup-center.tsx");
const page = read("app/page.tsx");

record("cleanup component owns compact table styles", component.includes("cleanup-review-table") && component.includes("cleanup-cell-clamp"));
record("row padding 10–12px", /padding:\s*10px 12px\s*!important/.test(component));
record("row gap max 8px", /border-spacing:\s*0 8px\s*!important/.test(component));
record("no row stretch sizing", /height:\s*auto\s*!important/.test(component)
    && /min-height:\s*0\s*!important/.test(component)
    && /flex-grow:\s*0\s*!important/.test(component));
record("line clamp 2 for long values", /line-clamp:\s*2/.test(component) && /-webkit-line-clamp:\s*2/.test(component));
record("title/tooltip preserved", component.includes("title={title || text}") || component.includes("title={account.email"));
record("radio vertically centered", /cleanup-select-cell/.test(component) && /vertical-align:\s*middle/.test(component));
record("desktop table layout fixed", /table-layout:\s*fixed\s*!important/.test(component));
record("mobile card breakpoint under 768", /@media \(max-width:\s*767px\)/.test(component)
    && /data-label/.test(component)
    && /thead \{\s*display:\s*none\s*!important/.test(component));
record("tablet/desktop width coverage", /@media \(min-width:\s*768px\) and \(max-width:\s*1024px\)/.test(component));
record("player clearance padding", /padding-bottom:\s*calc\(108px/.test(component));
record("page removed conflicting cleanup table cell styles", !page.includes(".cleanup-review-table th,")
    && page.includes("test-account-cleanup-center.tsx"));
record("logic endpoints unchanged", component.includes("/api/launch/test-account-cleanup")
    && component.includes('runAction("dry-run")')
    && component.includes('runAction("delete"')
    && component.includes('setLabel("protected_real_user")'));

const env = readEnv();
const baseUrl = env.VERIFY_BASE_URL || "https://music-data-base.vercel.app";
try {
    const owner = await ownerSession(env);
    if (!owner?.access_token) {
        record("live cleanup list load", false, "owner session missing");
    }
    else {
        const response = await fetch(`${baseUrl}/api/launch/test-account-cleanup?userId=${encodeURIComponent(owner.user.id)}`, {
            headers: { Authorization: `Bearer ${owner.access_token}` },
            cache: "no-store",
        });
        const json = await response.json().catch(() => ({}));
        const accounts = json.review?.accounts || [];
        const names = accounts.map((row) => String(row.displayName || row.email || ""));
        const hasFoundingProducer = names.some((name) => /founding producer probe/i.test(name));
        const hasFoundingProbe = names.some((name) => /^founding probe$/i.test(name.trim()) || (/founding probe/i.test(name) && !/producer/i.test(name)));
        const hasBrowserProbe = names.some((name) => /browser probe/i.test(name));
        record("live list has >= 3 accounts", response.ok && accounts.length >= 3, `status=${response.status}; count=${accounts.length}`);
        record("includes Founding Producer Probe", hasFoundingProducer, names.slice(0, 12).join(" | "));
        record("includes Founding Probe", hasFoundingProbe, names.slice(0, 12).join(" | "));
        record("includes Browser Probe", hasBrowserProbe, names.slice(0, 12).join(" | "));
    }
}
catch (error) {
    record("live cleanup list load", false, error instanceof Error ? error.message : String(error));
}

const failed = results.filter((row) => !row.ok).length;
console.log(`\nTEST_ACCOUNT_CLEANUP_UI_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
