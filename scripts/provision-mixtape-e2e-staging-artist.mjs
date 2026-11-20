/**
 * Staging-only: provision or reuse dedicated Mixtape E2E artist (no production).
 * Reads secrets from .env.staging.local only. Never logs passwords or service keys.
 *
 * Usage: node scripts/provision-mixtape-e2e-staging-artist.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_ENV_FILE = ".env.staging.local";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const E2E_EMAIL = "mdb-mixtape-e2e-artist@mdb-staging.invalid";
const DISPLAY_NAME = "MDB Mixtape E2E Artist";
const LEGAL_VERSION = "2026-09-10";
const MARKER = "mdb_signup_account_type=artist";
const BADGE = "Artist — Beta Access";
const evidenceDir = join(root, "tmp-mixtape-approved-e2e");
mkdirSync(evidenceDir, { recursive: true });

const REDACT = [/postgresql:\/\//i, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, /sb_secret_[A-Za-z0-9]+/g];

function sanitize(text) {
    let out = String(text || "");
    for (const pattern of REDACT) {
        out = out.replace(pattern, "[redacted]");
    }
    return out.slice(0, 300);
}

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function projectRefFromUrl(url) {
    const match = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return match ? match[1].toLowerCase() : "";
}

function parsePgConnectionString(raw) {
    const value = String(raw || "").trim();
    const match = value.match(/^(postgres(?:ql)?:\/\/)(.+)$/i);
    if (!match) return null;
    const body = match[2];
    const at = body.lastIndexOf("@");
    if (at <= 0) return null;
    const userinfo = body.slice(0, at);
    const hostpart = body.slice(at + 1).split("?")[0];
    const colon = userinfo.indexOf(":");
    const user = colon >= 0 ? userinfo.slice(0, colon) : userinfo;
    const password = colon >= 0 ? userinfo.slice(colon + 1) : "";
    const slash = hostpart.indexOf("/");
    const hostPort = slash >= 0 ? hostpart.slice(0, slash) : hostpart;
    const database = slash >= 0 ? hostpart.slice(slash + 1) : "postgres";
    const portSplit = hostPort.lastIndexOf(":");
    const host = portSplit >= 0 ? hostPort.slice(0, portSplit) : hostPort;
    const port = portSplit >= 0 ? hostPort.slice(portSplit + 1) : "5432";
    return { user, password, host, port: Number(port) || 5432, database: database || "postgres" };
}

function normalizePgConnectionString(raw) {
    const parsed = parsePgConnectionString(raw);
    if (!parsed) return String(raw || "").trim();
    const scheme = String(raw).match(/^(postgres(?:ql)?:\/\/)/i)?.[1] || "postgresql://";
    return `${scheme}${encodeURIComponent(parsed.user)}:${encodeURIComponent(parsed.password)}@${parsed.host}:${parsed.port}/${parsed.database}`;
}

function resolveDirectDatabaseUrl(connectionString) {
    const normalized = normalizePgConnectionString(connectionString);
    try {
        const url = new URL(normalized);
        if (!url.hostname.includes("pooler.supabase.com")) return normalized;
        url.username = "postgres";
        url.hostname = `db.${STAGING_REF}.supabase.co`;
        url.port = "5432";
        return url.toString();
    } catch {
        return normalized;
    }
}

function assertStagingDatabaseTarget(connectionString) {
    if (!connectionString) throw new Error("DATABASE_URL missing in .env.staging.local");
    const lower = connectionString.toLowerCase();
    if (lower.includes(PRODUCTION_REF)) throw new Error("DATABASE_URL points at production — abort");
    if (!lower.includes(STAGING_REF)) throw new Error(`DATABASE_URL must target staging ${STAGING_REF}`);
}

function createPgClient(env) {
    const connectionString = env.DATABASE_URL || env.SUPABASE_DB_URL || "";
    assertStagingDatabaseTarget(connectionString);
    const ssl = env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false };
    const timeout = { connectionTimeoutMillis: 20_000 };
    if (env.PGHOST && env.PGUSER && env.PGPASSWORD) {
        return new pg.Client({
            host: env.PGHOST,
            user: env.PGUSER,
            password: env.PGPASSWORD,
            database: env.PGDATABASE || "postgres",
            port: Number(env.PGPORT) || 5432,
            ssl,
            ...timeout,
        });
    }
    const parsed = parsePgConnectionString(connectionString);
    if (!parsed) {
        return new pg.Client({
            connectionString: resolveDirectDatabaseUrl(connectionString),
            ssl,
            ...timeout,
        });
    }
    let password = parsed.password;
    try {
        password = decodeURIComponent(password);
    } catch {
        /* keep */
    }
    const poolerHost = env.PGPOOLER_HOST || "aws-0-us-east-1.pooler.supabase.com";
    const usePooler =
        parsed.host === `db.${STAGING_REF}.supabase.co`
        || env.MDB_STAGING_PG_USE_POOLER === "1";
    if (usePooler) {
        return new pg.Client({
            host: poolerHost,
            port: Number(env.PGPORT || 5432),
            user: `postgres.${STAGING_REF}`,
            password,
            database: parsed.database,
            ssl,
            ...timeout,
        });
    }
    return new pg.Client({
        host: parsed.host,
        user: parsed.user,
        password,
        database: parsed.database,
        port: parsed.port,
        ssl,
        ...timeout,
    });
}

function assertStagingApiIdentity(env) {
    const urlRef = projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL || "");
    const decodeJwtRef = (token) => {
        if (!token || !token.includes(".")) return "";
        try {
            return String(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")).ref || "");
        } catch {
            return "";
        }
    };
    const anonRef = decodeJwtRef(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    const serviceRef = decodeJwtRef(env.SUPABASE_SERVICE_ROLE_KEY || "");
    if (urlRef === PRODUCTION_REF || anonRef === PRODUCTION_REF || serviceRef === PRODUCTION_REF) {
        throw new Error("Production Supabase ref detected — abort");
    }
    if (urlRef !== STAGING_REF || anonRef !== STAGING_REF || serviceRef !== STAGING_REF) {
        throw new Error("Staging API identity mismatch");
    }
}

async function findExistingArtist(client) {
    const { rows } = await client.query(
        `select u.id, u.email, u.email_confirmed_at,
                p.account_type, coalesce(p.is_admin, false) as is_admin,
                fm.approval_status,
                public.can_create_mixtapes(u.id) as can_create_mixtapes,
                public.can_upload_creator_content(u.id) as can_upload,
                public.is_platform_admin(u.id) as is_platform_admin
         from auth.users u
         left join public.profiles p on p.id = u.id
         left join public.founding_members fm on fm.user_id = u.id
         where lower(u.email) = lower($1)
         limit 1`,
        [E2E_EMAIL],
    );
    return rows[0] || null;
}

/** Mirrors ensureOrdinaryCreatorAppAccess + applySignupAccountTypeGrants (service_role only). */
async function applyOrdinaryArtistApproval(admin, userId) {
    const now = new Date().toISOString();

    const founding = await admin.from("founding_members").upsert(
        {
            user_id: userId,
            founding_role: "founding_artist",
            approval_status: "approved",
            invite_id: null,
            display_name: DISPLAY_NAME,
            social_link: MARKER,
            badge_label: BADGE,
            joined_at: now,
            approved_at: now,
            approved_by: null,
            rejected_at: null,
            rejected_by: null,
            updated_at: now,
        },
        { onConflict: "user_id" },
    );
    if (founding.error) throw founding.error;

    await admin
        .from("user_roles")
        .update({ status: "disabled", updated_at: now })
        .eq("user_id", userId)
        .in("role", ["admin", "platform_admin"]);

    const roleRow = await admin.from("user_roles").upsert(
        {
            user_id: userId,
            role: "artist",
            status: "active",
            granted_by: userId,
            updated_at: now,
        },
        { onConflict: "user_id,role" },
    );
    if (roleRow.error) throw roleRow.error;

    const profile = await admin.from("profiles").upsert(
        {
            id: userId,
            user_id: userId,
            account_type: "artist",
            display_name: DISPLAY_NAME,
            is_admin: false,
            updated_at: now,
        },
        { onConflict: "id" },
    );
    if (profile.error) throw profile.error;

    for (const policyType of ["terms", "privacy", "creator_upload"]) {
        const legal = await admin.from("legal_acceptances").upsert(
            {
                user_id: userId,
                policy_type: policyType,
                policy_version: LEGAL_VERSION,
                accepted_at: now,
                created_at: now,
            },
            { onConflict: "user_id,policy_type,policy_version" },
        );
        if (legal.error) throw legal.error;
    }
}

async function main() {
    const env = parseEnvFile(join(root, STAGING_ENV_FILE));
    const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const ref = projectRefFromUrl(projectUrl);

    const report = {
        stagingRef: ref,
        email: E2E_EMAIL,
        reused: false,
        created: false,
        checks: {},
        credentialFile: "tmp-mixtape-approved-e2e/staging-artist-credentials.env",
        provisionReport: "tmp-mixtape-approved-e2e/provision-report.json",
    };

    assertStagingApiIdentity(env);
    if (ref !== STAGING_REF) {
        throw new Error(`Staging ref mismatch: ${ref || "missing"} (expected ${STAGING_REF})`);
    }
    if (!serviceKey || !projectUrl || !anonKey) {
        throw new Error("Staging Supabase keys missing in .env.staging.local");
    }

    const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
    const pgClient = createPgClient(env);
    await pgClient.connect();

  let userId = "";
    let password = "";

    try {
        const existing = await findExistingArtist(pgClient);
        if (existing?.id && existing.can_create_mixtapes === true && existing.is_platform_admin !== true) {
            userId = existing.id;
            report.reused = true;
            report.checks.preexisting = {
                approval_status: existing.approval_status,
                account_type: existing.account_type,
                can_create_mixtapes: existing.can_create_mixtapes,
                can_upload: existing.can_upload,
            };
        }
        else {
            if (existing?.id) {
                userId = existing.id;
                report.reused = true;
            }
            else {
                password = `Stg!${randomBytes(5).toString("hex")}Aa1`;
                const { data, error } = await admin.auth.admin.createUser({
                    email: E2E_EMAIL,
                    password,
                    email_confirm: true,
                    user_metadata: {
                        display_name: DISPLAY_NAME,
                        role: "artist",
                        requestedAccountType: "artist",
                    },
                });
                if (error) throw error;
                userId = data.user.id;
                report.created = true;
            }

            if (!password) {
                password = `Stg!${randomBytes(5).toString("hex")}Aa1`;
                const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
                    password,
                    email_confirm: true,
                    user_metadata: {
                        display_name: DISPLAY_NAME,
                        role: "artist",
                        requestedAccountType: "artist",
                    },
                });
                if (pwErr) throw pwErr;
            }

            await applyOrdinaryArtistApproval(admin, userId);
        }

        if (!password) {
            password = `Stg!${randomBytes(5).toString("hex")}Aa1`;
            const { error: pwErr } = await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
            if (pwErr) throw pwErr;
        }

        const verified = await findExistingArtist(pgClient);
        report.userId = userId;
        report.emailConfirmed = Boolean(verified?.email_confirmed_at);
        report.checks.can_create_mixtapes = verified?.can_create_mixtapes === true;
        report.checks.can_upload_creator_content = verified?.can_upload === true;
        report.checks.is_platform_admin = verified?.is_platform_admin === true;
        report.checks.approval_status = verified?.approval_status;
        report.checks.account_type = verified?.account_type;

        const { rows: adminRoles } = await pgClient.query(
            `select role, status from public.user_roles where user_id = $1 and lower(role) = 'admin' and status = 'active'`,
            [userId],
        );
        report.checks.active_admin_role = adminRoles.length > 0;

        const anon = createClient(projectUrl, anonKey, { auth: { persistSession: false } });
        const signIn = await anon.auth.signInWithPassword({ email: E2E_EMAIL, password });
        report.checks.sign_in = !signIn.error;
        if (signIn.error) {
            report.checks.sign_in_detail = sanitize(signIn.error.message);
        }

        const credPath = join(evidenceDir, "staging-artist-credentials.env");
        writeFileSync(
            credPath,
            `MDB_MIXTAPE_E2E_BASE_URL=http://localhost:3003\nMDB_MIXTAPE_E2E_EMAIL=${E2E_EMAIL}\nMDB_MIXTAPE_E2E_PASSWORD=${password}\nMDB_MIXTAPE_E2E_EXPECTED_PROJECT_REF=${STAGING_REF}\n`,
            { encoding: "utf8", mode: 0o600 },
        );

        report.credentialFingerprint = {
            email_sha256_prefix: createHash("sha256").update(E2E_EMAIL).digest("hex").slice(0, 12),
            password_sha256_prefix: createHash("sha256").update(password).digest("hex").slice(0, 12),
        };

        const ok =
            report.checks.can_create_mixtapes
            && report.checks.can_upload_creator_content
            && !report.checks.is_platform_admin
            && !report.checks.active_admin_role
            && report.checks.sign_in;

        report.status = ok ? "PASS" : "FAIL";
        writeFileSync(join(evidenceDir, "provision-report.json"), JSON.stringify(report, null, 2));

        console.log(`provision-mixtape-e2e-staging-artist: ${report.status}`);
        console.log(`email=${E2E_EMAIL} user_id=${userId} reused=${report.reused} created=${report.created}`);
        console.log(`can_create_mixtapes=${report.checks.can_create_mixtapes} can_upload=${report.checks.can_upload_creator_content}`);
        console.log(`credentials_file=${report.credentialFile} (local only, not printed)`);
        console.log(`report=${report.provisionReport}`);

        process.exit(ok ? 0 : 1);
    }
    finally {
        await pgClient.end();
    }
}

main().catch((error) => {
    console.error("provision-mixtape-e2e-staging-artist failed:", sanitize(error.message));
    process.exit(1);
});