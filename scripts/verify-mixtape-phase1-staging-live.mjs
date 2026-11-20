/**
 * Staging-only Mixtape Phase 1 live verification.
 * Credentials: .env.staging.local ONLY (no .env.local, no process.env fallback for secrets).
 *
 * Usage:
 *   node scripts/verify-mixtape-phase1-staging-live.mjs
 *   node scripts/verify-mixtape-phase1-staging-live.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_ENV_FILE = ".env.staging.local";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const MIXTAPE_TABLES = [
    "mixtape_categories",
    "mixtapes",
    "mixtape_tracks",
    "mixtape_favorites",
    "mixtape_playback_sessions",
    "mixtape_plays",
    "mixtape_reports",
];
const MIGRATION_FILES = [
    "202611181000_mixtape_phase1_foundation.sql",
    "202611181001_mixtape_storage_bucket.sql",
];
const OPTIONAL_MIGRATION_FILES = [
    "202611181002_mixtape_qualified_play_ambiguity_fix.sql",
    "202611181003_mixtape_storage_anon_policy_eval.sql",
];

const FORBIDDEN_MIGRATION_PATTERNS = [
    /\bDROP\s+DATABASE\b/i,
    /\bDROP\s+SCHEMA\s+public\b/i,
    /\bTRUNCATE\s+TABLE\s+public\.(?!mixtape)/i,
    /\bpg_reset\b/i,
];

const SECRET_SUBSTRINGS = [/postgresql:\/\//i, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/];

function sanitizeDetail(message) {
    let text = String(message || "").slice(0, 200);
    for (const pattern of SECRET_SUBSTRINGS) {
        text = text.replace(pattern, "[redacted]");
    }
    return text;
}

/**
 * @returns {Record<string, string>}
 */
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

function loadStagingEnvOnly() {
    const path = join(root, STAGING_ENV_FILE);
    if (!existsSync(path)) {
        throw new Error(`${STAGING_ENV_FILE} missing — staging credentials not configured`);
    }
    if (existsSync(join(root, ".env.local"))) {
        // Intentionally not read — documented guard only.
    }
    return parseEnvFile(path);
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
    return {
        user,
        password,
        host,
        port: Number(port) || 5432,
        database: database || "postgres",
    };
}

function normalizePgConnectionString(raw) {
    const parsed = parsePgConnectionString(raw);
    if (!parsed) return String(raw || "").trim();
    const scheme = String(raw).match(/^(postgres(?:ql)?:\/\/)/i)?.[1] || "postgresql://";
    return `${scheme}${encodeURIComponent(parsed.user)}:${encodeURIComponent(parsed.password)}@${parsed.host}:${parsed.port}/${parsed.database}`;
}

function createStagingPgClient(env, connectionString) {
    const ssl = env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false };
    const timeout = { connectionTimeoutMillis: 20_000 };
    if (env.PGHOST && env.PGUSER && env.PGPASSWORD) {
        return new pg.Client({
            host: env.PGHOST,
            user: env.PGUSER,
            password: env.PGPASSWORD,
            database: env.PGDATABASE || "postgres",
            port: Number(env.PGPORT || 5432),
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
        // keep
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

function extractRef(url) {
    return url.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1] || "";
}

function decodeJwtRef(token) {
    if (!token || !token.includes(".")) return "";
    try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
        return String(payload.ref || "");
    } catch {
        return "";
    }
}

function assertStagingApiIdentity(env) {
    const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
    const urlRef = extractRef(projectUrl);
    const anonRef = decodeJwtRef(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    const serviceRef = decodeJwtRef(env.SUPABASE_SERVICE_ROLE_KEY || "");

    if (urlRef === PRODUCTION_REF || anonRef === PRODUCTION_REF || serviceRef === PRODUCTION_REF) {
        throw new Error("Production Supabase ref detected in staging env — abort");
    }
    if (urlRef !== STAGING_REF || anonRef !== STAGING_REF || serviceRef !== STAGING_REF) {
        throw new Error("Staging identity mismatch (URL/JWT refs must match approved staging ref)");
    }
    return { projectUrl, urlRef };
}

/**
 * @param {string} connectionString
 */
function assertStagingDatabaseTarget(connectionString) {
    if (!connectionString) {
        throw new Error("DATABASE_URL missing in .env.staging.local");
    }
    const lower = connectionString.toLowerCase();
    if (lower.includes(PRODUCTION_REF)) {
        throw new Error("DATABASE_URL points at production project — abort");
    }

    let host = "";
    let username = "";
    try {
        const parsed = new URL(normalizePgConnectionString(connectionString));
        host = parsed.hostname.toLowerCase();
        username = decodeURIComponent(parsed.username || "").toLowerCase();
    } catch {
        host = lower;
        username = lower;
    }

    if (username.includes(PRODUCTION_REF)) {
        throw new Error("DATABASE_URL points at production project — abort");
    }

    const directHost = `db.${STAGING_REF}.supabase.co`;
    const directOk = host === directHost || lower.includes(directHost);
    const poolerOk =
        lower.includes("pooler.supabase.com")
        && (username.includes(STAGING_REF) || lower.includes(`postgres.${STAGING_REF}`));
    const refOk = lower.includes(STAGING_REF);

    if (!directOk && !poolerOk && !refOk) {
        throw new Error(
            `DATABASE_URL must target staging ${STAGING_REF} (direct or pooler)`,
        );
    }
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

function assertMigrationSafe(sql, file) {
    for (const pattern of FORBIDDEN_MIGRATION_PATTERNS) {
        if (pattern.test(sql)) {
            throw new Error(`Migration ${file} contains forbidden pattern: ${pattern}`);
        }
    }
}

function record(results, name, ok, detail = "") {
    results.push({ name, ok, detail: sanitizeDetail(detail) });
    const mark = ok ? "PASS" : "FAIL";
    console.log(`${mark} ${name}${detail ? ` — ${sanitizeDetail(detail)}` : ""}`);
    if (!ok) record.exitCode = 1;
}

record.exitCode = 0;

const applyMode = process.argv.includes("--apply");
const results = [];
let exitCode = 0;

function failAndExit(message) {
    record(results, "staging verification", false, message);
    process.exit(1);
}

try {
    const env = loadStagingEnvOnly();
    record(results, "credentials source", true, STAGING_ENV_FILE);

    const { projectUrl } = assertStagingApiIdentity(env);
    record(results, "staging project ref locked", true, `ref=${STAGING_REF}`);
    record(results, "production ref rejected", true, `blocked_ref=${PRODUCTION_REF}`);

    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    record(
        results,
        "staging DATABASE_URL present",
        Boolean(databaseUrl),
        databaseUrl ? "configured" : "add to .env.staging.local (not in chat)",
    );

    if (applyMode || databaseUrl) {
        assertStagingDatabaseTarget(databaseUrl);
        record(results, "database target is staging", true, `host verified for ${STAGING_REF}`);
    }

    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false } });
    const anon = createClient(projectUrl, anonKey, { auth: { persistSession: false } });

    if (applyMode) {
        if (!databaseUrl) {
            failAndExit("Cannot apply: DATABASE_URL missing in .env.staging.local");
        }
        const client = createStagingPgClient(env, databaseUrl);
        await client.connect();
        try {
            for (const file of MIGRATION_FILES) {
                const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
                assertMigrationSafe(sql, file);
                try {
                    await client.query(sql);
                    record(results, `migration applied ${file}`, true);
                } catch (error) {
                    record(results, `migration applied ${file}`, false, sanitizeDetail(error.message));
                    process.exit(1);
                }
            }
            if (process.argv.includes("--apply-optional")) {
                for (const file of OPTIONAL_MIGRATION_FILES) {
                    const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
                    assertMigrationSafe(sql, file);
                    try {
                        await client.query(sql);
                        record(results, `optional migration applied ${file}`, true);
                    } catch (error) {
                        const message = String(error.message || "");
                        const benign = /already exists|duplicate key/i.test(message);
                        record(
                            results,
                            `optional migration applied ${file}`,
                            benign,
                            benign ? "already applied" : sanitizeDetail(message),
                        );
                    }
                }
            }
        } finally {
            await client.end();
        }
    } else if (databaseUrl) {
        record(results, "migration apply skipped", true, "run with --apply to execute DDL");
    }

    const applyOptionalOnly = process.argv.includes("--apply-optional") && !applyMode;
    if (applyOptionalOnly) {
        if (!databaseUrl) {
            failAndExit("Cannot apply optional migrations: DATABASE_URL missing");
        }
        const client = createStagingPgClient(env, databaseUrl);
        await client.connect();
        try {
            for (const file of OPTIONAL_MIGRATION_FILES) {
                const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
                assertMigrationSafe(sql, file);
                try {
                    await client.query(sql);
                    record(results, `optional migration applied ${file}`, true);
                } catch (error) {
                    const message = String(error.message || "");
                    const benign = /already exists|duplicate key/i.test(message);
                    record(
                        results,
                        `optional migration applied ${file}`,
                        benign,
                        benign ? "already applied" : sanitizeDetail(message),
                    );
                }
            }
        } finally {
            await client.end();
        }
    }

    if (databaseUrl) {
        const client = createStagingPgClient(env, databaseUrl);
        await client.connect();
        try {
            for (const table of MIXTAPE_TABLES) {
                const { rows } = await client.query(`select to_regclass($1) as reg`, [`public.${table}`]);
                record(results, `table ${table}`, Boolean(rows[0]?.reg));
            }

            const { rows: grantRows } = await client.query(`
              select privilege_type
              from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'mixtapes' and grantee = 'authenticated'
            `);
            const writePrivs = grantRows
                .map((r) => r.privilege_type)
                .filter((p) => ["INSERT", "UPDATE", "DELETE", "TRUNCATE"].includes(p));
            record(results, "authenticated cannot write mixtapes", writePrivs.length === 0, writePrivs.join(",") || "none");

            const { rows: fnRows } = await client.query(`
                select p.proname, pg_get_function_identity_arguments(p.oid) as args
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public'
                  and p.proname in (
                    'begin_mixtape_playback_session',
                    'advance_mixtape_playback_session',
                    'record_mixtape_qualified_play',
                    'mixtape_play_qualification_threshold'
                  )
                order by p.proname, args
            `);
            record(
                results,
                "playback rpc signatures",
                fnRows.some(
                    (r) =>
                        r.proname === "advance_mixtape_playback_session"
                        && r.args === "playback_session_id uuid, caller_user_id uuid",
                ),
                fnRows.map((r) => `${r.proname}(${r.args})`).join("; "),
            );

            const { rows: thresholdRows } = await client.query(`
                select
                  public.mixtape_play_qualification_threshold(120) as t120,
                  public.mixtape_play_qualification_threshold(10) as t10,
                  public.mixtape_play_qualification_threshold(2) as t2
            `);
            const t = thresholdRows[0];
            record(
                results,
                "qualification thresholds",
                Number(t.t120) === 30 && Number(t.t10) === 2.5 && Number(t.t2) === 0.5,
                `120->${t.t120}, 10->${t.t10}, 2->${t.t2}`,
            );

            const runToken = randomBytes(4).toString("hex");
            const ownerEmail = `mdb-mixtape-owner-${runToken}@mdb-staging.invalid`;
            const intruderEmail = `mdb-mixtape-intruder-${runToken}@mdb-staging.invalid`;
            const ownerPassword = `Stg!${runToken}Aa1`;
            const trackLongId = randomUUID();
            const trackShortId = randomUUID();
            const mixtapeId = randomUUID();
            let ownerId = "";
            let intruderId = "";
            const createdUserIds = [];

            const { data: ownerUser, error: ownerErr } = await admin.auth.admin.createUser({
                email: ownerEmail,
                password: ownerPassword,
                email_confirm: true,
            });
            if (ownerErr) throw ownerErr;
            ownerId = ownerUser.user.id;
            createdUserIds.push(ownerId);

            const { data: intruderUser, error: intruderErr } = await admin.auth.admin.createUser({
                email: intruderEmail,
                password: ownerPassword,
                email_confirm: true,
            });
            if (intruderErr) throw intruderErr;
            intruderId = intruderUser.user.id;
            createdUserIds.push(intruderId);

            const ownerClient = createClient(projectUrl, anonKey, { auth: { persistSession: false } });
            const intruderClient = createClient(projectUrl, anonKey, { auth: { persistSession: false } });
            await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
            await intruderClient.auth.signInWithPassword({ email: intruderEmail, password: ownerPassword });

            await client.query(
                `insert into public.mixtapes (id, user_id, title, status, moderation_state, published_at)
                 values ($1, $2, $3, 'published', 'clear', now())`,
                [mixtapeId, ownerId, `mdb-staging-verify-${runToken}`],
            );
            await client.query(
                `insert into public.mixtape_tracks (id, mixtape_id, user_id, position, title, duration_seconds, status, moderation_state, published_at)
                 values ($1, $2, $3, 1, 'long', 45, 'published', 'clear', now()),
                        ($4, $2, $3, 2, 'short', 8, 'published', 'clear', now())`,
                [trackLongId, mixtapeId, ownerId, trackShortId],
            );

            const sessionLong = (
                await client.query(
                    `select public.begin_mixtape_playback_session($1::uuid, $2::uuid) as id`,
                    [trackLongId, ownerId],
                )
            ).rows[0]?.id;
            record(results, "begin playback session", Boolean(sessionLong));

            await client.query(
                `select public.advance_mixtape_playback_session($1::uuid, $2::uuid)`,
                [sessionLong, ownerId],
            );
            await client.query(
                `select public.advance_mixtape_playback_session($1::uuid, $2::uuid)`,
                [sessionLong, ownerId],
            );
            const rapidListen = (
                await client.query(`select listened_seconds from public.mixtape_playback_sessions where id = $1`, [
                    sessionLong,
                ])
            ).rows[0]?.listened_seconds;
            record(
                results,
                "rapid advance no manufactured time",
                Number(rapidListen) < 1,
                `listened_seconds=${rapidListen}`,
            );

            await client.query(
                `update public.mixtape_playback_sessions
                 set last_progress_at = clock_timestamp() - interval '31 seconds', listened_seconds = 0
                 where id = $1`,
                [sessionLong],
            );
            await client.query(
                `select public.advance_mixtape_playback_session($1::uuid, $2::uuid)`,
                [sessionLong, ownerId],
            );
            const wallListen = Number(
                (
                    await client.query(`select listened_seconds from public.mixtape_playback_sessions where id = $1`, [
                        sessionLong,
                    ])
                ).rows[0]?.listened_seconds || 0,
            );
            record(
                results,
                "server wall-clock advance",
                wallListen >= 30 && wallListen <= 31.5,
                `listened_seconds=${wallListen}`,
            );

            const wrongOwner = (
                await client.query(
                    `select public.advance_mixtape_playback_session($1::uuid, $2::uuid) as ok`,
                    [sessionLong, intruderId],
                )
            ).rows[0]?.ok;
            record(results, "session ownership enforced", wrongOwner === false);

            const q1 = (
                await client.query(`select public.record_mixtape_qualified_play($1::uuid, $2::uuid) as ok`, [
                    sessionLong,
                    ownerId,
                ])
            ).rows[0]?.ok;
            const q2 = (
                await client.query(`select public.record_mixtape_qualified_play($1::uuid, $2::uuid) as ok`, [
                    sessionLong,
                    ownerId,
                ])
            ).rows[0]?.ok;
            const playCount = Number(
                (await client.query(`select play_count from public.mixtape_tracks where id = $1`, [trackLongId]))
                    .rows[0]?.play_count,
            );
            record(
                results,
                "duplicate qualification blocked",
                q1 === true && q2 === false && playCount === 1,
            );

            const sessionShort = (
                await client.query(
                    `select public.begin_mixtape_playback_session($1::uuid, $2::uuid) as id`,
                    [trackShortId, ownerId],
                )
            ).rows[0]?.id;
            await client.query(
                `update public.mixtape_playback_sessions
                 set last_progress_at = clock_timestamp() - interval '2.1 seconds', listened_seconds = 0
                 where id = $1`,
                [sessionShort],
            );
            await client.query(
                `select public.advance_mixtape_playback_session($1::uuid, $2::uuid)`,
                [sessionShort, ownerId],
            );
            const shortOk = (
                await client.query(`select public.record_mixtape_qualified_play($1::uuid, $2::uuid) as ok`, [
                    sessionShort,
                    ownerId,
                ])
            ).rows[0]?.ok;
            record(results, "short track 25% qualification", shortOk === true, "duration=8s threshold=2s");

            const ownerPath = `${ownerId}/${mixtapeId}/tracks/probe-${runToken}.txt`;
            const foreignPath = `${intruderId}/${randomUUID()}/tracks/probe-${runToken}.txt`;
            const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

            const adminEmail = `mdb-mixtape-platform-admin-${runToken}@mdb-staging.invalid`;
            const { data: adminUser, error: adminUserErr } = await admin.auth.admin.createUser({
                email: adminEmail,
                password: ownerPassword,
                email_confirm: true,
            });
            if (adminUserErr) throw adminUserErr;
            const adminUserId = adminUser.user.id;
            createdUserIds.push(adminUserId);
            await client.query(
                `insert into public.user_roles (user_id, role, status)
                 values ($1::uuid, 'admin', 'active')
                 on conflict do nothing`,
                [adminUserId],
            );
            const adminClient = createClient(projectUrl, anonKey, { auth: { persistSession: false } });
            await adminClient.auth.signInWithPassword({ email: adminEmail, password: ownerPassword });

            const ownerUpload = await ownerClient.storage.from("mixtapes").upload(ownerPath, blob, { upsert: false });
            const intruderForeign = await intruderClient.storage.from("mixtapes").upload(foreignPath, blob, {
                upsert: false,
            });
            const intruderOwnerPath = await intruderClient.storage
                .from("mixtapes")
                .upload(ownerPath, blob, { upsert: false });
            const ownerList = await ownerClient.storage.from("mixtapes").list(`${ownerId}/${mixtapeId}/tracks`);
            const intruderOwnerDownload = await intruderClient.storage.from("mixtapes").download(ownerPath);
            const platformAdminDownload = await adminClient.storage.from("mixtapes").download(ownerPath);

            record(results, "storage owner upload", !ownerUpload.error);
            record(results, "storage intruder own prefix allowed", !intruderForeign.error);
            record(results, "storage intruder owner path denied", Boolean(intruderOwnerPath.error));
            record(results, "storage owner can list own prefix", !ownerList.error);
            record(results, "storage intruder owner read denied", Boolean(intruderOwnerDownload.error));
            record(results, "storage platform admin read allowed", !platformAdminDownload.error);

            const { error: clientInsertErr } = await ownerClient.from("mixtapes").insert({
                user_id: ownerId,
                title: "client-insert-probe",
            });
            record(results, "authenticated direct mixtape insert denied", Boolean(clientInsertErr));

            await ownerClient.storage.from("mixtapes").remove([ownerPath]);
            await client.query(`delete from public.mixtape_plays where mixtape_id = $1`, [mixtapeId]);
            await client.query(`delete from public.mixtape_playback_sessions where mixtape_id = $1`, [mixtapeId]);
            await client.query(`delete from public.mixtape_tracks where mixtape_id = $1`, [mixtapeId]);
            await client.query(`delete from public.mixtapes where id = $1`, [mixtapeId]);
            for (const userId of createdUserIds) {
                await admin.auth.admin.deleteUser(userId);
            }
            record(results, "staging fixtures cleaned up", true);
        } finally {
            await client.end();
        }
    } else if (!applyMode) {
        for (const table of MIXTAPE_TABLES) {
            const { error } = await admin.from(table).select("id").limit(1);
            const missing = error && (error.code === "PGRST205" || /does not exist/i.test(error.message));
            record(
                results,
                `table ${table}`,
                !missing,
                missing ? "missing (run --apply after DATABASE_URL)" : error ? error.code : "reachable",
            );
            if (missing) exitCode = 1;
        }
    }

    const { data: buckets, error: bucketErr } = await admin.storage.listBuckets();
    const mixtapeBucket = buckets?.find((b) => b.id === "mixtapes");
    record(results, "mixtapes bucket exists", Boolean(mixtapeBucket) && !bucketErr);
    record(results, "mixtapes bucket private", mixtapeBucket?.public === false);

    const { error: anonReadErr } = await anon.storage.from("mixtapes").download(`${randomUUID()}/x.bin`);
    record(
        results,
        "anon mixtape object read denied",
        Boolean(anonReadErr),
        anonReadErr ? sanitizeDetail(anonReadErr.message) : "unexpected success",
    );
    record(
        results,
        "anon storage policy eval (no is_platform_admin leak)",
        !anonReadErr || !/permission denied for function is_platform_admin/i.test(anonReadErr.message || ""),
        anonReadErr ? sanitizeDetail(anonReadErr.message) : "n/a",
    );

    if (databaseUrl) {
        const grantClient = createStagingPgClient(env, databaseUrl);
        await grantClient.connect();
        try {
            const { rows: migrationRows } = await grantClient.query(`
                select
                  to_regprocedure('public.record_mixtape_qualified_play(uuid,uuid)') is not null as qualified_fix,
                  has_function_privilege('anon', 'public.is_platform_admin(uuid)', 'EXECUTE') as anon_admin_fn
            `);
            const row = migrationRows[0] || {};
            record(
                results,
                "migration 002 qualified-play RPC present",
                row.qualified_fix === true,
                row.qualified_fix ? "ok" : "apply 202611181002 on staging",
            );
            record(
                results,
                "migration 003 anon is_platform_admin grant",
                row.anon_admin_fn === true,
                row.anon_admin_fn ? "ok" : "run --apply-optional for 202611181003",
            );
        } finally {
            await grantClient.end();
        }
    }

    const { error: podcastAnonErr } = await anon.from("podcast_shows").select("id").limit(1);
    record(
        results,
        "existing catalog still readable (podcast_shows)",
        !podcastAnonErr,
        podcastAnonErr ? sanitizeDetail(podcastAnonErr.message) : "ok",
    );
} catch (error) {
    record(results, "staging verification", false, sanitizeDetail(error.message || error));
    exitCode = 1;
}

const finalExit = exitCode || record.exitCode || 0;
if (finalExit) process.exit(finalExit);
console.log("\nverify-mixtape-phase1-staging-live.mjs: ok");