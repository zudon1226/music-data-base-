#!/usr/bin/env node
/**
 * Production-only: provision first approved video-only Creator fixture.
 * Requires MDB_CONFIRM_PRODUCTION_FIXTURE=1
 * Never logs passwords. Credentials hash prefix only.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadProductionEnv, PRODUCTION_REF } from "./lib/load-production-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const E2E_EMAIL = String(process.env.MDB_PHASE29K_VIDEO_CREATOR_EMAIL || "mdb-phase29k-video-creator@mdb-production.invalid").trim().toLowerCase();
const DISPLAY_NAME = "MDB Phase 29K Video Creator";
const LEGAL_VERSION = "2026-09-10";
const MARKER = "mdb_signup_account_type=creator";
const evidenceDir = join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });

if (process.env.MDB_CONFIRM_PRODUCTION_FIXTURE !== "1") {
    console.error("Set MDB_CONFIRM_PRODUCTION_FIXTURE=1 to provision on Production");
    process.exit(1);
}

const env = loadProductionEnv();
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("Production Supabase keys missing");
    process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

async function countCreators(client) {
    const { rows } = await client.query(`
      select count(*)::int c from public.profiles
      where lower(account_type) in ('creator','founding_creator')
    `);
    return rows[0]?.c ?? 0;
}

async function findByEmail(client, email) {
    const { rows } = await client.query(
        `select u.id, u.email from auth.users u where lower(u.email) = lower($1) limit 1`,
        [email],
    );
    return rows[0] || null;
}

async function applyCreatorApproval(userId) {
    const now = new Date().toISOString();
    const founding = await admin.from("founding_members").upsert({
        user_id: userId,
        founding_role: "founding_creator",
        approval_status: "approved",
        invite_id: null,
        display_name: DISPLAY_NAME,
        social_link: MARKER,
        badge_label: "Video Creator — Beta",
        joined_at: now,
        approved_at: now,
        updated_at: now,
    }, { onConflict: "user_id" });
    if (founding.error) throw founding.error;

    const roleRow = await admin.from("user_roles").upsert({
        user_id: userId,
        role: "creator",
        status: "active",
        granted_by: userId,
        updated_at: now,
    }, { onConflict: "user_id,role" });
    if (roleRow.error) throw roleRow.error;

    const profile = await admin.from("profiles").upsert({
        id: userId,
        user_id: userId,
        account_type: "founding_creator",
        display_name: DISPLAY_NAME,
        is_admin: false,
        updated_at: now,
    }, { onConflict: "id" });
    if (profile.error) throw profile.error;

    for (const policyType of ["terms", "privacy", "creator_upload"]) {
        const legal = await admin.from("legal_acceptances").upsert({
            user_id: userId,
            policy_type: policyType,
            policy_version: LEGAL_VERSION,
            accepted_at: now,
            created_at: now,
        }, { onConflict: "user_id,policy_type,policy_version" });
        if (legal.error) throw legal.error;
    }
}

async function main() {
    const dbUrl = env.DATABASE_URL;
    if (!dbUrl) {
        console.error("DATABASE_URL required for pre-check");
        process.exit(1);
    }
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
        const before = await countCreators(client);
        if (before > 0 && !process.env.MDB_FORCE_REPROVISION_VIDEO_CREATOR) {
            console.log(`SKIP creator already exists count=${before}`);
            process.exit(0);
        }

        let userId = "";
        let password = "";
        const existing = await findByEmail(client, E2E_EMAIL);
        if (existing?.id) {
            userId = existing.id;
            password = String(process.env.MDB_PHASE29K_VIDEO_CREATOR_PASSWORD || "").trim();
            if (!password) {
                console.error("Fixture user exists; set MDB_PHASE29K_VIDEO_CREATOR_PASSWORD or use new email");
                process.exit(1);
            }
        } else {
            password = randomBytes(18).toString("base64url");
            const created = await admin.auth.admin.createUser({
                email: E2E_EMAIL,
                password,
                email_confirm: true,
                user_metadata: { mdb_signup_account_type: "creator", display_name: DISPLAY_NAME },
            });
            if (created.error || !created.data.user?.id) {
                throw created.error || new Error("createUser failed");
            }
            userId = created.data.user.id;
        }

        await applyCreatorApproval(userId);

        const m = await client.query("select public.can_upload_music_content($1::uuid) m, public.can_upload_video_content($1::uuid) v", [userId]);
        const report = {
            projectRef: PRODUCTION_REF,
            userIdPrefix: userId.slice(0, 8),
            emailDomain: E2E_EMAIL.split("@")[1],
            musicRpc: m.rows[0]?.m,
            videoRpc: m.rows[0]?.v,
            provisionedAt: new Date().toISOString(),
            passwordSha256Prefix: createHash("sha256").update(password).digest("hex").slice(0, 12),
        };

        writeFileSync(join(evidenceDir, "phase29k-production-video-creator-fixture.json"), JSON.stringify({
            ...report,
            email: E2E_EMAIL,
            password,
        }, null, 2));

        console.log("PROVISION PASS", JSON.stringify({ ...report, email: E2E_EMAIL.replace(/(.{2}).+(@.+)/, "$1***$2") }));
    } finally {
        await client.end().catch(() => {});
    }
}

main().catch((error) => {
    console.error("PROVISION FAIL", error instanceof Error ? error.message.slice(0, 200) : error);
    process.exit(1);
});