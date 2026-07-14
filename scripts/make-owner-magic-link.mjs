/**
 * Create a short-lived owner magic-link for manual browser verification.
 * Does not print the link by default unless PRINT_LINK=1.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv() {
    const text = readFileSync(path.join(root, ".env.local"), "utf8");
    const env = {};
    for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i <= 0) continue;
        let v = line.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        env[line.slice(0, i).trim()] = v;
    }
    return env;
}

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const redirectTo = process.env.REDIRECT_TO || "http://127.0.0.1:3010";
const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "zudon1226@gmail.com",
    options: { redirectTo },
});

if (error) {
    console.log(JSON.stringify({ ok: false, error: error.message }));
    process.exit(1);
}

const actionLink = data?.properties?.action_link || "";
const hashed = data?.properties?.hashed_token || "";
const out = {
    ok: Boolean(actionLink),
    email: "zudon1226@gmail.com",
    userId: data?.user?.id || "",
    redirectTo,
    // Prefer token hash verify path for local apps that may not accept supabase redirect hosts.
    hashedTokenPresent: Boolean(hashed),
    actionLinkHost: actionLink ? new URL(actionLink).host : "",
};
writeFileSync(path.join(root, "tmp-owner-magic-meta.json"), JSON.stringify(out, null, 2));
if (process.env.PRINT_LINK === "1") {
    writeFileSync(path.join(root, "tmp-owner-magic-link.txt"), actionLink);
}
console.log(JSON.stringify(out));
