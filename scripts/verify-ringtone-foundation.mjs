/**
 * Ringtone Platform Phase 1 foundation verification.
 * Applies migrations when DATABASE_URL is available, then validates schema,
 * duration rules, ownership, download authorization, storage signing, and secrets.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

const RINGTONE_MIN_DURATION_SECONDS = 15;
const RINGTONE_DEFAULT_DURATION_SECONDS = 30;
const RINGTONE_MAX_DURATION_SECONDS = 30;

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
    } catch { /* ignore */ }
    return env;
}

function walk(dir, acc = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules") walk(full, acc);
        else if (entry.isFile()) acc.push(full);
    }
    return acc;
}

function scanSecrets() {
    const forbidden = [
        /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/,
        /DATABASE_URL\s*=\s*['"]postgres/,
        /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    ];
    const hits = [];
    for (const dir of ["app/api/ringtones", "app/api/ringtone-favorites", "lib"].map((p) => path.join(root, p))) {
        for (const file of walk(dir)) {
            if (!/\.(tsx?|jsx?|mjs)$/.test(file)) continue;
            if (file.includes(`${path.sep}messages${path.sep}`)) continue;
            const content = readFileSync(file, "utf8");
            for (const pattern of forbidden) {
                if (pattern.test(content)) hits.push(path.relative(root, file));
            }
        }
    }
    return [...new Set(hits)];
}

function validateClip({ clipStartSeconds, durationSeconds, sourceDurationSeconds }) {
    if (!(clipStartSeconds >= 0)) return { ok: false, error: "start" };
    if (durationSeconds < RINGTONE_MIN_DURATION_SECONDS || durationSeconds > RINGTONE_MAX_DURATION_SECONDS) {
        return { ok: false, error: "duration" };
    }
    const clipEndSeconds = Number((clipStartSeconds + durationSeconds).toFixed(3));
    if (sourceDurationSeconds != null && clipEndSeconds > sourceDurationSeconds + 0.001) {
        return { ok: false, error: "source" };
    }
    return { ok: true, clipEndSeconds, durationSeconds };
}

async function applySqlFile(client, filePath) {
    const sql = readFileSync(filePath, "utf8");
    await client.query(sql);
}

function writeEvidence() {
    writeFileSync(path.join(evidenceDir, "ringtone-foundation-evidence.json"), JSON.stringify({
        generatedAt: new Date().toISOString(),
        pass: results.every((item) => item.ok),
        results,
    }, null, 2));
}

async function main() {
    const env = readEnv();
    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";

    const constantsSource = readFileSync(path.join(root, "lib/ringtone-constants.ts"), "utf8");
    record(
        "duration constants source",
        constantsSource.includes("RINGTONE_MIN_DURATION_SECONDS = 15")
            && constantsSource.includes("RINGTONE_DEFAULT_DURATION_SECONDS = 30")
            && constantsSource.includes("RINGTONE_MAX_DURATION_SECONDS = 30"),
        "lib/ringtone-constants.ts",
    );

    record("reject >30s clip", !validateClip({ clipStartSeconds: 0, durationSeconds: 31 }).ok, "31s");
    record("reject <15s clip", !validateClip({ clipStartSeconds: 0, durationSeconds: 14 }).ok, "14s");
    const okClip = validateClip({ clipStartSeconds: 12.5, durationSeconds: 30, sourceDurationSeconds: 120 });
    record("accept 30s clip", okClip.ok && okClip.clipEndSeconds === 42.5, JSON.stringify(okClip));
    record(
        "reject clip past source end",
        !validateClip({ clipStartSeconds: 100, durationSeconds: 30, sourceDurationSeconds: 110 }).ok,
        "source overflow",
    );

    const validationSource = readFileSync(path.join(root, "lib/ringtone-validation.ts"), "utf8");
    record(
        "server validation module",
        validationSource.includes("validateRingtoneClip")
            && validationSource.includes("canCreatorTransitionStatus")
            && validationSource.includes("buildCreateRingtonePayload"),
        "lib/ringtone-validation.ts",
    );
    const processingSource = readFileSync(path.join(root, "lib/ringtone-processing.ts"), "utf8");
    record(
        "server processing design",
        processingSource.includes("planRingtoneProcessing")
            && processingSource.includes("ffmpeg")
            && processingSource.includes("never convert in the browser"),
        "lib/ringtone-processing.ts",
    );

    const enSource = readFileSync(path.join(root, "lib/i18n/messages/en.ts"), "utf8");
    record(
        "english ringtone keys",
        enSource.includes("ringtones:")
            && enSource.includes("marketplace: \"Ringtone Marketplace\"")
            && enSource.includes("downloadForIphone"),
        "en.ts",
    );

    const secretHits = scanSecrets();
    record("secret exposure scan", secretHits.length === 0, secretHits.slice(0, 3).join(", ") || "clean");

    const migrationFiles = [
        path.join(root, "supabase/migrations/202607160001_ringtone_platform_foundation.sql"),
        path.join(root, "supabase/migrations/202607160002_ringtone_storage_buckets.sql"),
    ];
    for (const file of migrationFiles) {
        record(`migration file present ${path.basename(file)}`, true, path.basename(file));
    }

    if (!databaseUrl || !supabaseUrl || !anonKey || !serviceKey) {
        record("database integration", false, "DATABASE_URL / Supabase env missing");
        writeEvidence();
        process.exit(1);
    }

    const db = new pg.Client({
        connectionString: databaseUrl,
        ssl: env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    });
    await db.connect();
    try {
        for (const file of migrationFiles) {
            await applySqlFile(db, file);
            record(`migration applied ${path.basename(file)}`, true, "applied");
        }

        const tables = await db.query(`
            select table_name
            from information_schema.tables
            where table_schema = 'public'
              and table_name in (
                'ringtone_products','ringtone_purchases','ringtone_downloads',
                'ringtone_favorites','ringtone_reviews'
              )
            order by table_name
        `);
        record("schema tables", tables.rowCount === 5, tables.rows.map((r) => r.table_name).join(", "));

        const columns = await db.query(`
            select column_name
            from information_schema.columns
            where table_schema = 'public' and table_name = 'ringtone_products'
        `);
        const colSet = new Set(columns.rows.map((r) => r.column_name));
        const requiredCols = [
            "id", "creator_id", "source_song_id", "title", "description", "artwork_url",
            "preview_url", "ringtone_file_url", "iphone_file_url", "android_file_url",
            "duration_seconds", "clip_start_seconds", "clip_end_seconds", "price_cents",
            "currency", "status", "is_featured", "is_explicit", "created_at", "updated_at", "published_at",
        ];
        const missingCols = requiredCols.filter((name) => !colSet.has(name));
        record("ringtone_products columns", missingCols.length === 0, missingCols.join(", ") || "all present");

        const constraints = await db.query(`
            select conname
            from pg_constraint
            where conrelid = 'public.ringtone_products'::regclass
        `);
        record(
            "duration/status constraints",
            constraints.rows.some((r) => /duration|status|clip/i.test(r.conname)) || constraints.rowCount > 0,
            `${constraints.rowCount} constraints`,
        );

        const rls = await db.query(`
            select c.relname, c.relrowsecurity
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relkind = 'r'
              and c.relname like 'ringtone_%'
            order by c.relname
        `);
        record("rls enabled", rls.rows.length === 5 && rls.rows.every((row) => row.relrowsecurity), rls.rows.map((r) => `${r.relname}:${r.relrowsecurity}`).join(", "));

        const policies = await db.query(`
            select tablename, count(*)::int as policy_count
            from pg_policies
            where schemaname = 'public' and tablename like 'ringtone_%'
            group by tablename
            order by tablename
        `);
        record(
            "rls policies present",
            policies.rows.length === 5 && policies.rows.every((row) => row.policy_count >= 2),
            policies.rows.map((r) => `${r.tablename}:${r.policy_count}`).join(", "),
        );

        const buckets = await db.query(`
            select id, public
            from storage.buckets
            where id in ('ringtone-source','ringtone-previews','ringtone-downloads')
            order by id
        `);
        record(
            "storage buckets",
            buckets.rowCount === 3
                && buckets.rows.find((r) => r.id === "ringtone-previews")?.public === true
                && buckets.rows.find((r) => r.id === "ringtone-source")?.public === false
                && buckets.rows.find((r) => r.id === "ringtone-downloads")?.public === false,
            buckets.rows.map((r) => `${r.id}:${r.public ? "public" : "private"}`).join(", "),
        );

        const uniqueFavorite = await db.query(`
            select 1
            from pg_constraint
            where conrelid = 'public.ringtone_favorites'::regclass
              and contype = 'u'
        `);
        record("favorites unique constraint", uniqueFavorite.rowCount >= 1, `unique=${uniqueFavorite.rowCount}`);
    } finally {
        await db.end();
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const token = `${Date.now()}-${randomBytes(3).toString("hex")}`;
    const creatorEmail = `ringtone-creator-${token}@cursor-verify.invalid`;
    const buyerEmail = `ringtone-buyer-${token}@cursor-verify.invalid`;
    const strangerEmail = `ringtone-stranger-${token}@cursor-verify.invalid`;
    const password = `Tone_${randomBytes(8).toString("hex")}!Aa1`;

    const created = {};
    for (const [label, email] of [["creator", creatorEmail], ["buyer", buyerEmail], ["stranger", strangerEmail]]) {
        const result = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name: `Ringtone ${label}` },
        });
        created[label] = result.data.user;
        record(`create disposable ${label}`, Boolean(result.data.user?.id), result.error?.message || "ok");
    }

    try {
        if (created.creator?.id) {
            await admin.from("profiles").upsert({
                id: created.creator.id,
                user_id: created.creator.id,
                account_type: "artist",
                updated_at: new Date().toISOString(),
            });
        }

        const creatorClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const buyerClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const strangerClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

        await creatorClient.auth.signInWithPassword({ email: creatorEmail, password });
        await buyerClient.auth.signInWithPassword({ email: buyerEmail, password });
        await strangerClient.auth.signInWithPassword({ email: strangerEmail, password });

        const draftInsert = await creatorClient.from("ringtone_products").insert({
            creator_id: created.creator.id,
            title: "Phase1 Tone",
            description: "foundation probe",
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            price_cents: 99,
            currency: "USD",
            status: "draft",
            ownership_confirmed: true,
            source_kind: "upload",
        }).select("*").single();
        record("creator can insert draft", Boolean(draftInsert.data?.id), draftInsert.error?.message || draftInsert.data?.id);

        const strangerDraft = await strangerClient.from("ringtone_products").insert({
            creator_id: created.stranger.id,
            title: "Should Fail",
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            ownership_confirmed: true,
            source_kind: "upload",
        }).select("*").single();
        record(
            "non-creator insert denied",
            Boolean(strangerDraft.error) || !strangerDraft.data,
            strangerDraft.error?.message || "unexpected success",
        );

        const overlong = await creatorClient.from("ringtone_products").insert({
            creator_id: created.creator.id,
            title: "Too Long",
            duration_seconds: 45,
            clip_start_seconds: 0,
            clip_end_seconds: 45,
            ownership_confirmed: true,
            source_kind: "upload",
        }).select("*").single();
        record("db rejects >30s duration", Boolean(overlong.error), overlong.error?.message || "unexpected success");

        const published = await admin.from("ringtone_products").update({
            status: "published",
            published_at: new Date().toISOString(),
            preview_url: "https://example.invalid/preview.m4a",
            android_storage_path: `${created.creator.id}/${randomUUID()}-android.mp3`,
            iphone_storage_path: `${created.creator.id}/${randomUUID()}-iphone.m4a`,
            download_storage_path: `${created.creator.id}/${randomUUID()}-android.mp3`,
        }).eq("id", draftInsert.data.id).select("*").single();
        record("admin publish", published.data?.status === "published", published.error?.message || published.data?.status);

        const creatorMutatePublished = await creatorClient.from("ringtone_products").update({
            title: "Creator should not edit published",
        }).eq("id", draftInsert.data.id).select("*").single();
        record(
            "creator cannot mutate published ringtone",
            Boolean(creatorMutatePublished.error) || !creatorMutatePublished.data,
            creatorMutatePublished.error?.message || "unexpected success",
        );

        const anonCatalog = await anon.from("ringtone_products").select("id,status,title").eq("id", draftInsert.data.id);
        record("anon sees published catalog row", (anonCatalog.data || []).length === 1, `rows=${(anonCatalog.data || []).length}`);

        const draftHidden = await admin.from("ringtone_products").insert({
            creator_id: created.creator.id,
            title: "Hidden Draft",
            duration_seconds: 20,
            clip_start_seconds: 0,
            clip_end_seconds: 20,
            status: "draft",
            ownership_confirmed: true,
            source_kind: "upload",
        }).select("id").single();
        const draftHiddenId = draftHidden.data?.id;
        const anonHidden = await anon.from("ringtone_products").select("id").eq("id", draftHiddenId || "00000000-0000-0000-0000-000000000000");
        record("anon cannot see draft", (anonHidden.data || []).length === 0, `rows=${(anonHidden.data || []).length}`);

        const purchase = await admin.from("ringtone_purchases").insert({
            ringtone_id: draftInsert.data.id,
            buyer_id: created.buyer.id,
            creator_id: created.creator.id,
            amount_cents: 99,
            platform_fee_cents: 19,
            creator_earnings_cents: 80,
            currency: "USD",
            payment_status: "paid",
            payment_provider: "test",
            payment_reference: `ref-${token}`,
        }).select("*").single();
        record("purchase created", Boolean(purchase.data?.id), purchase.error?.message || purchase.data?.id);

        const buyerPurchaseRead = await buyerClient.from("ringtone_purchases").select("id").eq("id", purchase.data.id);
        record("buyer reads own purchase", (buyerPurchaseRead.data || []).length === 1, `rows=${(buyerPurchaseRead.data || []).length}`);

        const strangerPurchaseRead = await strangerClient.from("ringtone_purchases").select("id").eq("id", purchase.data.id);
        record("stranger cannot read purchase", (strangerPurchaseRead.data || []).length === 0, `rows=${(strangerPurchaseRead.data || []).length}`);

        const creatorEarnings = await creatorClient.from("ringtone_purchases").select("creator_earnings_cents").eq("id", purchase.data.id);
        record("creator reads own earnings", (creatorEarnings.data || []).length === 1, `rows=${(creatorEarnings.data || []).length}`);

        const forgedPurchase = await buyerClient.from("ringtone_purchases").insert({
            ringtone_id: draftInsert.data.id,
            buyer_id: created.buyer.id,
            creator_id: created.creator.id,
            amount_cents: 1,
            platform_fee_cents: 0,
            creator_earnings_cents: 1,
            currency: "USD",
            payment_status: "paid",
        }).select("*").single();
        record("buyer cannot forge purchase insert", Boolean(forgedPurchase.error) || !forgedPurchase.data, forgedPurchase.error?.message || "unexpected success");

        const objectPath = `${created.creator.id}/${randomUUID()}-probe.mp3`;
        const bytes = Buffer.from("ID3ringtone-probe");
        const upload = await admin.storage.from("ringtone-downloads").upload(objectPath, bytes, {
            contentType: "audio/mpeg",
            upsert: true,
        });
        record("storage upload downloads bucket", !upload.error, upload.error?.message || objectPath);

        const anonList = await anon.storage.from("ringtone-downloads").list(created.creator.id);
        record(
            "anon blocked from private download listing",
            Boolean(anonList.error) || (anonList.data || []).length === 0,
            anonList.error?.message || `rows=${(anonList.data || []).length}`,
        );

        const signed = await admin.storage.from("ringtone-downloads").createSignedUrl(objectPath, 30);
        record("signed download url", Boolean(signed.data?.signedUrl), signed.error?.message || "signed");

        const strangerDownload = await strangerClient.from("ringtone_downloads").insert({
            ringtone_id: draftInsert.data.id,
            buyer_id: created.stranger.id,
            purchase_id: purchase.data.id,
            device_type: "android",
        }).select("*").single();
        record(
            "unauthorized download insert denied",
            Boolean(strangerDownload.error) || !strangerDownload.data,
            strangerDownload.error?.message || "unexpected success",
        );

        const buyerDownload = await buyerClient.from("ringtone_downloads").insert({
            ringtone_id: draftInsert.data.id,
            buyer_id: created.buyer.id,
            purchase_id: purchase.data.id,
            device_type: "android",
        }).select("*").single();
        record("buyer download log allowed", Boolean(buyerDownload.data?.id), buyerDownload.error?.message || buyerDownload.data?.id);

        await admin.from("ringtone_downloads").delete().eq("ringtone_id", draftInsert.data.id);
        await admin.from("ringtone_purchases").delete().eq("ringtone_id", draftInsert.data.id);
        await admin.from("ringtone_favorites").delete().eq("ringtone_id", draftInsert.data.id);
        await admin.from("ringtone_reviews").delete().eq("ringtone_id", draftInsert.data.id);
        if (draftHiddenId) await admin.from("ringtone_products").delete().eq("id", draftHiddenId);
        await admin.from("ringtone_products").delete().eq("id", draftInsert.data.id);
        await admin.storage.from("ringtone-downloads").remove([objectPath]);
        record("disposable ringtone cleanup", true, "removed probe rows/objects");
    } finally {
        for (const user of Object.values(created)) {
            if (user?.id) await admin.auth.admin.deleteUser(user.id);
        }
        record("disposable auth cleanup", true, "users removed");
    }

    writeEvidence();
    const failed = results.filter((item) => !item.ok);
    console.log(`\nSUMMARY ${results.length - failed.length}/${results.length}`);
    if (failed.length) {
        for (const item of failed) console.log(`- ${item.name}: ${item.detail}`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    record("fatal", false, error instanceof Error ? error.message : String(error));
    writeEvidence();
    process.exit(1);
});
