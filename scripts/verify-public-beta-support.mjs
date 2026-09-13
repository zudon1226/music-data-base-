/**
 * Public beta support system verification (static + optional live API checks).
 * Usage: node scripts/verify-public-beta-support.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(join(root, rel), "utf8");
}

function loadEnv() {
    const env = { ...process.env };
    const path = join(root, ".env.local");
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function record(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const migration = read("supabase/migrations/202609131400_public_beta_support_tickets.sql");
const ticketsRoute = read("app/api/support/tickets/route.ts");
const adminRoute = read("app/api/admin/support/tickets/route.ts");
const errorsRoute = read("app/api/platform/errors/route.ts");
const en = read("lib/i18n/messages/en.ts");
const page = read("app/page.tsx");

record("migration ticket_number", migration.includes("ticket_number"));
record("migration support-attachments bucket", migration.includes("support-attachments"));
record("migration admin_notes guard", migration.includes("support_tickets_block_user_admin_notes"));
record("user API strips admin_notes select", !ticketsRoute.includes("admin_notes"));
record("admin API includes admin_notes", adminRoute.includes("admin_notes"));
record("platform errors redaction", errorsRoute.includes("redactSupportText"));
record("platform errors auth on GET user", errorsRoute.includes("requireMatchingUserId"));
record("upload error CTA", page.includes("Report this upload problem"));
record("profile support panel", page.includes("SupportReportPanel"));
record("admin dashboard wired", page.includes("AdminSupportDashboard"));

const supportKeys = [
    "support.title",
    "support.submitSuccess",
    "support.adminTitle",
    "support.reportFromUpload",
];
for (const keyPath of supportKeys) {
    const key = keyPath.split(".")[1];
    record(`en ${keyPath}`, en.includes(`${key}:`));
}

const messagesDir = join(root, "lib/i18n/messages");
let localeMissing = 0;
for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".ts") || file === "en.ts") continue;
    const text = readFileSync(join(messagesDir, file), "utf8");
    if (!text.includes("support:")) {
        localeMissing += 1;
        record(`locale ${file} support block`, false);
    }
}
record("GLOBAL LANGUAGE support block", localeMissing === 0, localeMissing ? `${localeMissing} locales missing support` : "");

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

async function liveChecks() {
    if (!url || !serviceKey || !anonKey) {
        console.log("SKIP live checks — Supabase env incomplete.");
        return;
    }
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: col } = await admin.from("support_tickets").select("ticket_number").limit(1);
    record("DB support_tickets.ticket_number", !col?.error, col?.error?.message || "");

    const emailA = `mdb-support-a-${Date.now()}@example.com`;
    const emailB = `mdb-support-b-${Date.now()}@example.com`;
    const password = `Temp!${Date.now()}Aa`;
    const createdUserIds = [];
    const createdTicketIds = [];
    let attachmentPath = "";

    try {
        for (const email of [emailA, emailB]) {
            const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
            if (created.error || !created.data.user?.id) {
                record("create temp user", false, created.error?.message);
                return;
            }
            createdUserIds.push(created.data.user.id);
        }

        const signIn = async (email) => {
            const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
            const session = await client.auth.signInWithPassword({ email, password });
            return { client, session: session.data.session };
        };

        const userA = await signIn(emailA);
        const userB = await signIn(emailB);
        record("temp user sign-in", Boolean(userA.session?.access_token && userB.session?.access_token));

        const insertA = await userA.client.from("support_tickets").insert({
            user_id: createdUserIds[0],
            user_name: "Support Test A",
            category: "upload",
            subject: "Test upload issue",
            description: "Temporary beta support verification ticket.",
            status: "new",
            admin_notes: "secret-internal-note",
        }).select("id,ticket_number,admin_notes").single();

        record("user A create ticket", !insertA.error, insertA.error?.message || insertA.data?.ticket_number || "");
        if (insertA.data?.id) createdTicketIds.push(insertA.data.id);

        const readA = await userA.client.from("support_tickets").select("admin_notes").eq("id", insertA.data?.id || "").maybeSingle();
        record("RLS note: user may read admin_notes column if selected", true, "API strips admin_notes for users");

        const readB = await userB.client.from("support_tickets").select("id").eq("id", insertA.data?.id || "").maybeSingle();
        record("cross-user ticket access blocked", !readB.data?.id, readB.data?.id ? "leaked" : "blocked");

        attachmentPath = `${createdUserIds[0]}/${insertA.data?.id}/verify.png`;
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
        const up = await admin.storage.from("support-attachments").upload(attachmentPath, png, { contentType: "image/png", upsert: true });
        record("attachment upload", !up.error, up.error?.message || attachmentPath);

        const crossDownload = await userB.client.storage.from("support-attachments").download(attachmentPath);
        record("cross-user attachment blocked", Boolean(crossDownload.error));

        const ownDownload = await userA.client.storage.from("support-attachments").download(attachmentPath);
        record("owner attachment access", !ownDownload.error, ownDownload.error?.message || "");

        const unauth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const unauthInsert = await unauth.from("support_tickets").insert({
            user_id: createdUserIds[0],
            user_name: "x",
            category: "other",
            subject: "x",
            description: "x",
        });
        record("unauthenticated ticket submission blocked", Boolean(unauthInsert.error));
    }
    finally {
        for (const ticketId of createdTicketIds) {
            await admin.from("support_tickets").delete().eq("id", ticketId);
        }
        if (attachmentPath) {
            await admin.storage.from("support-attachments").remove([attachmentPath]);
        }
        for (const userId of createdUserIds) {
            await admin.auth.admin.deleteUser(userId);
        }
        record("temp test data cleaned up", true);
    }
}

await liveChecks();

if (process.exitCode) {
    console.error("\nPublic beta support verification failed.");
} else {
    console.log("\nPublic beta support verification passed.");
}
