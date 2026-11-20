import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
    join(root, ".env.staging.local"),
    join(root, "..", "music-data-base-pwa-clean", ".env.staging.local"),
];

for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        if (!/^\s*DATABASE_URL\s*=/.test(line)) continue;
        const value = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").trim().replace(/^['"]|['"]$/g, "");
        const schemeSep = value.indexOf("://");
        const credHost = schemeSep >= 0 ? value.slice(schemeSep + 3) : value;
        const atCount = (credHost.match(/@/g) || []).length;
        const hasBrackets = /\[/.test(value);
        console.log("file", file);
        console.log("length", value.length);
        console.log("at_count", atCount);
        console.log("ipv6_brackets", hasBrackets);
        console.log("contains_staging_ref", value.includes("jzlegcbotqfzevtczwhx"));
        console.log("contains_production_ref", value.includes("aehuszoadgqtbkxsliyy"));
        if (atCount !== 1) {
            console.log("hint", "password may need URL-encoding (expect exactly one @ before host)");
        }
        const masked = value.replace(
            /^(postgres(?:ql)?:\/\/)(?:[^:@/]+)(?::[^@]*)?(@)/i,
            "$1***$2",
        );
        console.log("masked_shape", masked);
        const at = credHost.lastIndexOf("@");
        const userinfo = at > 0 ? credHost.slice(0, at) : "";
        const colon = userinfo.indexOf(":");
        const user = colon >= 0 ? userinfo.slice(0, colon) : userinfo;
        console.log("pg_user", user || "(empty)");
        console.log("password_present", colon >= 0 && userinfo.slice(colon + 1).length > 0);
        console.log(
            "looks_like_placeholder",
            /\[YOUR|PASSWORD\]|REPLACE|CHANGEME/i.test(value),
        );
    }
}