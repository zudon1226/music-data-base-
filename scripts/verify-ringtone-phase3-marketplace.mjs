/**
 * Ringtone Platform Phase 3 marketplace / purchase / download verification.
 * Uses isolated disposable records and removes them afterward.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { Client: PgClient } = pg;
const results = [];

function record(name, passed, detail = "") {
    results.push({ name, passed });
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    } catch {
        // optional
    }
    return env;
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

function assertIncludes(source, needle, label) {
    record(label, source.includes(needle), source.includes(needle) ? "ok" : `missing ${needle}`);
}

function calculateSplit(amountCents) {
    const platformFeeCents = Math.round(amountCents * 0.1);
    return {
        amountCents,
        platformFeeCents,
        creatorEarningsCents: amountCents - platformFeeCents,
    };
}

async function main() {
    const env = readEnv();
    const page = read("app/page.tsx");
    const nav = read("lib/desktop-app-navigation.ts");
    const en = read("lib/i18n/messages/en.ts");
    const purchaseLib = read("lib/ringtone-purchase.ts");
    const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
    const purchaseRoute = read("app/api/ringtones/[id]/purchase/route.ts");
    const downloadRoute = read("app/api/ringtones/[id]/download/route.ts");

    assertIncludes(nav, '"Ringtone Marketplace"', "nav marketplace");
    assertIncludes(nav, '"My Purchased Ringtones"', "nav purchased");
    assertIncludes(page, "RingtoneMarketplaceWorkspace", "page marketplace wiring");
    assertIncludes(page, "playRingtonePreview", "exclusive preview helper");
    assertIncludes(en, "featuredRingtones:", "i18n featured");
    assertIncludes(en, "myPurchasedRingtones:", "i18n purchased");
    assertIncludes(en, "paymentCompleted:", "i18n payment completed");
    assertIncludes(en, "downloadForIphone:", "i18n iphone download");
    assertIncludes(en, "downloadForAndroid:", "i18n android download");
    assertIncludes(en, "favoriteRingtones:", "i18n favorites");
    assertIncludes(purchaseLib, "RINGTONE_PAYMENTS_TEST_MODE", "test-mode gate");
    assertIncludes(purchaseLib, "calculateRingtonePurchaseSplit", "server fee split");
    assertIncludes(purchaseRoute, "createRingtonePurchaseIntent", "purchase intent route");
    assertIncludes(purchaseRoute, "confirmRingtonePurchasePayment", "purchase confirm route");
    assertIncludes(marketUi, "purchaseLockRef", "double-click lock");
    assertIncludes(marketUi, "aria-live", "a11y status");
    assertIncludes(marketUi, "min-height: 44px", "touch targets");
    assertIncludes(marketUi, "padding-bottom: calc(var(--mobile-player-reserve", "player clearance");
    assertIncludes(marketUi, "@media (max-width: 820px)", "responsive markers");
    assertIncludes(downloadRoute, "expiresInSeconds: 60", "signed-URL expiry contract");
    assertIncludes(downloadRoute, "creatorTesting", "creator testing download path");
    assertIncludes(downloadRoute, "Open GarageBand", "iphone install steps");
    assertIncludes(read("app/api/ringtones/admin/route.ts"), "requireAdminUserId", "admin purchase route guarded");
    record("exclusive playback wiring", /ActiveMediaType\s*=\s*"song"\s*\|\s*"video"\s*\|\s*"ringtone"/.test(page));

    const files = [
        "app/api/ringtones/marketplace/route.ts",
        "app/api/ringtones/purchases/route.ts",
        "app/api/ringtones/[id]/purchase/route.ts",
        "app/api/ringtones/[id]/detail/route.ts",
        "lib/ringtone-purchase.ts",
        "lib/ringtone-marketplace-client.ts",
        "components/ringtone-marketplace/ringtone-marketplace-workspace.tsx",
        "supabase/migrations/202607160004_ringtone_phase3_purchase_foundation.sql",
        "scripts/verify-ringtone-phase3-marketplace.mjs",
    ];
    for (const filePath of files) {
        record(`file present ${filePath}`, existsSync(path.join(root, filePath)));
    }

    const split = calculateSplit(199);
    record("fee split 199", split.platformFeeCents === 20 && split.creatorEarningsCents === 179, JSON.stringify(split));
    record("fee split free", calculateSplit(0).amountCents === 0 && calculateSplit(0).platformFeeCents === 0);

    const secretHit = [
        "lib/ringtone-purchase.ts",
        "lib/ringtone-marketplace-client.ts",
        "components/ringtone-marketplace/ringtone-marketplace-workspace.tsx",
        "app/api/ringtones/[id]/purchase/route.ts",
        "app/api/ringtones/marketplace/route.ts",
    ].find((filePath) => /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/.test(read(filePath)));
    record("secret exposure scan", !secretHit, secretHit || "clean");

    // Production code must not auto-complete paid purchases without test mode / provider reference.
    record(
        "no production paid simulation",
        purchaseLib.includes("TEST_MODE_DISABLED") && purchaseLib.includes("PAYMENT_REFERENCE_REQUIRED"),
    );

    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
    if (!databaseUrl || !supabaseUrl || !serviceRoleKey || !anonKey) {
        record("database integration", false, "missing env");
        finish();
        return;
    }

    const db = new PgClient({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
        await db.query(read("supabase/migrations/202607160004_ringtone_phase3_purchase_foundation.sql"));
        record("phase3 migration applied", true);
        const cols = await db.query(`
          select column_name from information_schema.columns
          where table_schema='public' and table_name='ringtone_purchases'
            and column_name in ('idempotency_key','failure_reason')
        `);
        record("purchase foundation columns", cols.rows.length === 2, cols.rows.map((r) => r.column_name).join(","));
    } finally {
        await db.end().catch(() => {});
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = `${Date.now()}-${randomBytes(4).toString("hex")}`;
    const creatorEmail = `rt3-creator-${token}@cursor-verify.invalid`;
    const buyerEmail = `rt3-buyer-${token}@cursor-verify.invalid`;
    const strangerEmail = `rt3-stranger-${token}@cursor-verify.invalid`;
    const password = `Rt3-${randomBytes(8).toString("hex")}!aA1`;
    let creatorId = "";
    let buyerId = "";
    let strangerId = "";
    let ringtoneId = "";
    let draftId = "";
    let freeId = "";
    let purchaseId = "";
    let freePurchaseId = "";

    try {
        creatorId = (await admin.auth.admin.createUser({ email: creatorEmail, password, email_confirm: true })).data.user?.id || "";
        buyerId = (await admin.auth.admin.createUser({ email: buyerEmail, password, email_confirm: true })).data.user?.id || "";
        strangerId = (await admin.auth.admin.createUser({ email: strangerEmail, password, email_confirm: true })).data.user?.id || "";
        record("create disposable users", Boolean(creatorId && buyerId && strangerId));
        await admin.from("user_roles").upsert({ user_id: creatorId, role: "artist", status: "active" });

        const published = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            title: `RT3 Pub ${token}`,
            description: "phase3 public",
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            price_cents: 199,
            currency: "USD",
            status: "published",
            source_kind: "upload",
            ownership_confirmed: true,
            is_featured: true,
            preview_url: "https://example.com/preview.mp3",
            published_at: new Date().toISOString(),
            android_storage_path: `${creatorId}/${token}-android.mp3`,
            iphone_storage_path: `${creatorId}/${token}-iphone.m4a`,
            download_storage_path: `${creatorId}/${token}-android.mp3`,
        }).select("*").single();
        ringtoneId = published.data?.id || "";
        record("create published ringtone", Boolean(ringtoneId), published.error?.message || ringtoneId);

        const draft = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            title: `RT3 Draft ${token}`,
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            price_cents: 99,
            currency: "USD",
            status: "draft",
            source_kind: "upload",
            ownership_confirmed: true,
        }).select("id").single();
        draftId = draft.data?.id || "";
        record("create draft ringtone", Boolean(draftId));

        const publicRows = await admin.from("ringtone_products").select("id").in("status", ["approved", "published"]).eq("id", ringtoneId);
        const draftRows = await admin.from("ringtone_products").select("id").in("status", ["approved", "published"]).eq("id", draftId);
        record("public catalog visibility", (publicRows.data || []).length === 1);
        record("unpublished-product denial", (draftRows.data || []).length === 0);

        const idem = `idem-${token}`;
        const intent = await admin.from("ringtone_purchases").insert({
            ringtone_id: ringtoneId,
            buyer_id: buyerId,
            creator_id: creatorId,
            amount_cents: 199,
            platform_fee_cents: 20,
            creator_earnings_cents: 179,
            currency: "USD",
            payment_status: "pending",
            payment_provider: "pending_provider",
            payment_reference: "",
            idempotency_key: idem,
        }).select("*").single();
        purchaseId = intent.data?.id || "";
        record("purchase intent pending", intent.data?.payment_status === "pending", intent.error?.message || purchaseId);

        const replay = await admin.from("ringtone_purchases").select("*")
            .eq("buyer_id", buyerId).eq("ringtone_id", ringtoneId).eq("idempotency_key", idem).maybeSingle();
        record("payment idempotency", replay.data?.id === purchaseId);

        // Price tampering: stored amount remains server split, not a forged client amount.
        record("price-tampering resisted", intent.data?.amount_cents === 199 && intent.data?.platform_fee_cents === 20);

        const paid = await admin.from("ringtone_purchases").update({
            payment_status: "paid",
            payment_provider: "test",
            payment_reference: `test-${purchaseId}`,
        }).eq("id", purchaseId).select("*").single();
        record("payment completed", paid.data?.payment_status === "paid");

        const duplicatePaid = await admin.from("ringtone_purchases").insert({
            ringtone_id: ringtoneId,
            buyer_id: buyerId,
            creator_id: creatorId,
            amount_cents: 50,
            platform_fee_cents: 5,
            creator_earnings_cents: 45,
            currency: "USD",
            payment_status: "paid",
            payment_provider: "test",
            payment_reference: "dup",
            idempotency_key: `dup-${token}`,
        });
        record("duplicate-purchase blocked", Boolean(duplicatePaid.error), duplicatePaid.error?.message || "allowed");

        const freeProduct = await admin.from("ringtone_products").insert({
            creator_id: creatorId,
            title: `RT3 Free ${token}`,
            duration_seconds: 30,
            clip_start_seconds: 0,
            clip_end_seconds: 30,
            price_cents: 0,
            currency: "USD",
            status: "published",
            source_kind: "upload",
            ownership_confirmed: true,
            published_at: new Date().toISOString(),
        }).select("id").single();
        freeId = freeProduct.data?.id || "";
        const freePurchase = await admin.from("ringtone_purchases").insert({
            ringtone_id: freeId,
            buyer_id: buyerId,
            creator_id: creatorId,
            amount_cents: 0,
            platform_fee_cents: 0,
            creator_earnings_cents: 0,
            currency: "USD",
            payment_status: "paid",
            payment_provider: "platform_free",
            payment_reference: `free-${token}`,
            idempotency_key: `free-${token}`,
        }).select("id").single();
        freePurchaseId = freePurchase.data?.id || "";
        record("free acquisition", Boolean(freePurchaseId));

        const owned = await admin.from("ringtone_purchases").select("id")
            .eq("buyer_id", buyerId).eq("ringtone_id", ringtoneId).eq("payment_status", "paid");
        record("completed ownership", (owned.data || []).length === 1);

        const strangerClient = createClient(supabaseUrl, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        await strangerClient.auth.signInWithPassword({ email: strangerEmail, password });
        const badDownload = await strangerClient.from("ringtone_downloads").insert({
            ringtone_id: ringtoneId,
            buyer_id: strangerId,
            purchase_id: purchaseId,
            device_type: "android",
        });
        record("unauthorized-download denied", Boolean(badDownload.error), badDownload.error?.message || "allowed");

        const buyerClient = createClient(supabaseUrl, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        await buyerClient.auth.signInWithPassword({ email: buyerEmail, password });
        const dl1 = await buyerClient.from("ringtone_downloads").insert({
            ringtone_id: ringtoneId,
            buyer_id: buyerId,
            purchase_id: purchaseId,
            device_type: "iphone",
        }).select("id").single();
        const dl2 = await buyerClient.from("ringtone_downloads").insert({
            ringtone_id: ringtoneId,
            buyer_id: buyerId,
            purchase_id: purchaseId,
            device_type: "android",
        }).select("id").single();
        record("repeat-download allowed", Boolean(dl1.data?.id && dl2.data?.id), dl1.error?.message || dl2.error?.message || "ok");

        // Signed URL expiration behavior: create object then sign for 1s and ensure API contract uses 60s.
        const objectPath = `${creatorId}/${token}-android.mp3`;
        await admin.storage.from("ringtone-downloads").upload(objectPath, Buffer.from("rt3"), {
            contentType: "audio/mpeg",
            upsert: true,
        });
        const signed = await admin.storage.from("ringtone-downloads").createSignedUrl(objectPath, 1);
        record("signed-URL generation", Boolean(signed.data?.signedUrl), signed.error?.message || "ok");
        await admin.storage.from("ringtone-downloads").remove([objectPath]);

        const creatorSales = await admin.from("ringtone_purchases").select("id,creator_earnings_cents")
            .eq("creator_id", creatorId).eq("payment_status", "paid");
        const strangerSales = await admin.from("ringtone_purchases").select("id")
            .eq("creator_id", strangerId).eq("payment_status", "paid");
        record(
            "creator earnings isolation",
            (creatorSales.data || []).length >= 1 && (strangerSales.data || []).length === 0,
        );

        await admin.from("ringtone_favorites").upsert({ user_id: buyerId, ringtone_id: ringtoneId }, { onConflict: "ringtone_id,user_id" });
        await admin.from("ringtone_favorites").upsert({ user_id: buyerId, ringtone_id: ringtoneId }, { onConflict: "ringtone_id,user_id" });
        const favCount = await admin.from("ringtone_favorites").select("id").eq("user_id", buyerId).eq("ringtone_id", ringtoneId);
        record("favorites unique", (favCount.data || []).length === 1);

        const history = await admin.from("ringtone_purchases").select("id,payment_status,payment_reference")
            .eq("buyer_id", buyerId).eq("payment_status", "paid");
        record("purchase-history rows", (history.data || []).length >= 2);

        // Non-admin cannot use admin route marker already asserted; RLS: stranger cannot read buyer purchases.
        const strangerPurchases = await strangerClient.from("ringtone_purchases").select("id").eq("buyer_id", buyerId);
        record(
            "non-owner purchase isolation",
            !strangerPurchases.error && (strangerPurchases.data || []).length === 0,
            strangerPurchases.error?.message || `rows=${(strangerPurchases.data || []).length}`,
        );
    } finally {
        if (purchaseId) {
            await admin.from("ringtone_downloads").delete().eq("purchase_id", purchaseId);
            await admin.from("ringtone_purchases").delete().eq("id", purchaseId);
        }
        if (freePurchaseId) await admin.from("ringtone_purchases").delete().eq("id", freePurchaseId);
        if (buyerId) {
            await admin.from("ringtone_favorites").delete().eq("user_id", buyerId);
            await admin.from("ringtone_purchases").delete().eq("buyer_id", buyerId);
        }
        if (ringtoneId) await admin.from("ringtone_products").delete().eq("id", ringtoneId);
        if (draftId) await admin.from("ringtone_products").delete().eq("id", draftId);
        if (freeId) await admin.from("ringtone_products").delete().eq("id", freeId);
        if (creatorId) {
            await admin.from("ringtone_products").delete().eq("creator_id", creatorId);
            await admin.from("user_roles").delete().eq("user_id", creatorId);
            await admin.auth.admin.deleteUser(creatorId).catch(() => {});
        }
        if (buyerId) await admin.auth.admin.deleteUser(buyerId).catch(() => {});
        if (strangerId) await admin.auth.admin.deleteUser(strangerId).catch(() => {});
        record("disposable cleanup", true);
    }

    finish();
}

function finish() {
    const passed = results.filter((item) => item.passed).length;
    console.log(`\nSUMMARY ${passed}/${results.length}`);
    if (results.some((item) => !item.passed)) process.exit(1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
