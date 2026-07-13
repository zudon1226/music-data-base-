/**
 * Local-only inspection: owner user_metadata key names and byte sizes.
 * Does not print metadata values or secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function readEnv(name) {
    const text = readFileSync(".env.local", "utf8");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    if (!line) return "";
    return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

function byteSize(value) {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
}

const OWNER_ID = "33564e29-6f65-4efd-8a27-6b58bc45a455";
const supabase = createClient(readEnv("NEXT_PUBLIC_SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.admin.getUserById(OWNER_ID);
if (error) {
    console.error("ERROR", error.message);
    process.exit(1);
}

const meta = data.user?.user_metadata || {};
const app = data.user?.app_metadata || {};

const userMetadataKeys = Object.keys(meta).sort().map((key) => {
    const value = meta[key];
    const entry = {
        key,
        type: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
        bytes: byteSize(value),
    };
    if (value && typeof value === "object" && !Array.isArray(value)) {
        entry.childKeys = Object.keys(value).sort().map((child) => ({
            key: child,
            type: Array.isArray(value[child]) ? "array" : typeof value[child],
            bytes: byteSize(value[child]),
            arrayLength: Array.isArray(value[child]) ? value[child].length : undefined,
        }));
    }
    if (Array.isArray(value)) {
        entry.arrayLength = value.length;
    }
    return entry;
});

console.log(JSON.stringify({
    userId: data.user.id,
    email: data.user.email,
    totalUserMetadataBytes: byteSize(meta),
    totalAppMetadataBytes: byteSize(app),
    userMetadataKeys,
    appMetadataKeys: Object.keys(app).sort().map((key) => ({
        key,
        type: typeof app[key],
        bytes: byteSize(app[key]),
    })),
}, null, 2));
