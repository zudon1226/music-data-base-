#!/usr/bin/env node
/**
 * Records current creator_upload legal acceptance for legacy Production creators missing it.
 * Requires MDB_CONFIRM_PRODUCTION_LEGAL_BACKFILL=1 — never weakens RLS.
 */
import { createClient } from "@supabase/supabase-js";
import { loadProductionEnv } from "./lib/load-production-env.mjs";
import { LEGAL_POLICY_VERSION } from "../lib/legal-signup-validation.mjs";

const env = loadProductionEnv();
if (process.env.MDB_CONFIRM_PRODUCTION_LEGAL_BACKFILL !== "1") {
    console.error("Set MDB_CONFIRM_PRODUCTION_LEGAL_BACKFILL=1");
    process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

const { data: users, error } = await admin.from("profiles").select("user_id,account_type");
if (error) throw error;

let updated = 0;
for (const row of users || []) {
    const accountType = String(row.account_type || "").toLowerCase();
    if (!["artist", "producer", "admin", "founding_artist", "founding_producer", "creator", "founding_creator"].includes(accountType)) {
        continue;
    }
    const userId = row.user_id;
    const existing = await admin.from("legal_acceptances")
        .select("id")
        .eq("user_id", userId)
        .eq("policy_type", "creator_upload")
        .eq("policy_version", LEGAL_POLICY_VERSION)
        .maybeSingle();
    if (existing.data?.id) continue;
    const ins = await admin.from("legal_acceptances").insert({
        user_id: userId,
        policy_type: "creator_upload",
        policy_version: LEGAL_POLICY_VERSION,
        accepted_at: new Date().toISOString(),
    });
    if (ins.error) {
        console.error("skip", userId.slice(0, 8), ins.error.message);
        continue;
    }
    updated += 1;
}
console.log("BACKFILL_CREATOR_UPLOAD_LEGAL", { updated, policyVersion: LEGAL_POLICY_VERSION });