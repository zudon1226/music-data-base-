import { NextResponse } from "next/server";
import { EXPECTED_STORAGE_BUCKETS, PUBLIC_LAUNCH_ROUTES, REQUIRED_LAUNCH_TABLES } from "@/lib/launch-readiness";
import { getErrorMessage, getPublicSiteUrl, getSupabaseServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkTable(tableName: string) {
  try {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from(tableName).select("*", { count: "exact", head: true });
    return {
      name: tableName,
      ok: !error,
      message: error ? getErrorMessage(error) : "Ready",
    };
  } catch (error) {
    return {
      name: tableName,
      ok: false,
      message: getErrorMessage(error),
    };
  }
}

async function checkStorageBuckets() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;

    const existing = new Set((data || []).map((bucket) => bucket.name));
    return EXPECTED_STORAGE_BUCKETS.map((name) => ({
      name,
      ok: existing.has(name),
      message: existing.has(name) ? "Ready" : "Missing bucket",
    }));
  } catch (error) {
    return EXPECTED_STORAGE_BUCKETS.map((name) => ({
      name,
      ok: false,
      message: getErrorMessage(error),
    }));
  }
}

async function loadChecklist() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("launch_checklist")
      .select("area,status,details,checked_at")
      .order("area", { ascending: true });
    if (error) throw error;
    return { ok: true, items: data || [], message: "Ready" };
  } catch (error) {
    return { ok: false, items: [], message: getErrorMessage(error) };
  }
}

export async function GET() {
  const siteUrl = getPublicSiteUrl();
    const env = {
        siteUrl,
        hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
        hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
        hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) &&
            process.env.SUPABASE_SERVICE_ROLE_KEY !== "your_service_role_key_here",
        nodeEnv: process.env.NODE_ENV || "development",
        usesLocalhost: siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1"),
    };
    let supabaseConfigError = "";
    try {
        getSupabaseServerClient();
    }
    catch (error) {
        supabaseConfigError = getErrorMessage(error);
    }

  const [tables, buckets, checklist] = await Promise.all([
    Promise.all(REQUIRED_LAUNCH_TABLES.map(checkTable)),
    checkStorageBuckets(),
    loadChecklist(),
  ]);

  const publicRoutes = PUBLIC_LAUNCH_ROUTES.map((route) => ({
    ...route,
    ok: true,
  }));

  const productionChecks = [
    {
      name: "Supabase URL",
      ok: env.hasSupabaseUrl,
      message: env.hasSupabaseUrl ? "Configured" : "Missing NEXT_PUBLIC_SUPABASE_URL",
    },
    {
      name: "Supabase anon key",
      ok: env.hasAnonKey,
      message: env.hasAnonKey ? "Configured" : "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY",
    },
    {
      name: "Service role key",
      ok: env.hasServiceRoleKey && !supabaseConfigError,
      message: supabaseConfigError || (env.hasServiceRoleKey ? "Configured for server-side launch tools" : "Missing SUPABASE_SERVICE_ROLE_KEY"),
    },
    {
      name: "Public site URL",
      ok: Boolean(env.siteUrl) && !env.usesLocalhost,
      message: env.usesLocalhost ? "Using localhost. Set NEXT_PUBLIC_SITE_URL before production launch." : env.siteUrl,
    },
  ];

  const checks = [
    ...tables.map((table) => table.ok),
    ...buckets.map((bucket) => bucket.ok),
    ...publicRoutes.map((route) => route.ok),
    ...productionChecks.map((check) => check.ok),
    checklist.ok,
  ];

  return NextResponse.json({
    ok: checks.every(Boolean),
    checkedAt: new Date().toISOString(),
    env: {
      ...env,
      supabaseConfigError,
    },
    productionChecks,
    tables,
    storageBuckets: buckets,
    publicRoutes,
    checklist,
  });
}
