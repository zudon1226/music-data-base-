import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const RINGTONE_ID = "44444444-4444-4444-8444-444444444444";

function isFile(filePath) {
    try {
        return statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function resolveLocal(specifier, parentURL) {
    let base = "";
    if (specifier.startsWith("@/")) {
        base = path.join(root, specifier.slice(2));
    } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const parent = parentURL ? fileURLToPath(parentURL) : root;
        base = path.resolve(path.dirname(parent), specifier);
    } else {
        return null;
    }
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.js`, `${base}.mjs`];
    for (const candidate of candidates) {
        if (existsSync(candidate) && isFile(candidate)) return pathToFileURL(candidate).href;
    }
    return null;
}

const mocks = new Map([
    ["/lib/server-supabase.ts", `
const USER_ID = ${JSON.stringify(USER_ID)};
const RINGTONE_ID = ${JSON.stringify(RINGTONE_ID)};
function probe() {
  if (!globalThis.__mdbBetaLockProbe) globalThis.__mdbBetaLockProbe = { writes: [], stripe: 0, tickets: 0, network: [] };
  return globalThis.__mdbBetaLockProbe;
}
function chain(table, result) {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    in() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    maybeSingle: async () => result,
    single: async () => result,
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    insert(row) { probe().writes.push({ op: "insert", table, row }); throw new Error("unexpected insert into " + table); },
    update(row) { probe().writes.push({ op: "update", table, row }); throw new Error("unexpected update on " + table); },
    delete() { probe().writes.push({ op: "delete", table }); throw new Error("unexpected delete on " + table); },
    upsert(row) { probe().writes.push({ op: "upsert", table, row }); throw new Error("unexpected upsert into " + table); },
  };
  return builder;
}
export const PLATFORM_OWNER_EMAIL = "owner@example.test";
export function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown server error");
}
export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}
export function isPlatformOwnerEmail() { return false; }
export async function isPlatformOwnerUserId() { return false; }
export function getPublicSiteUrl() { return "http://127.0.0.1:3000"; }
export function getSupabaseServerClient() {
  return {
    from(table) {
      if (table === "ringtone_products") {
        return chain(table, { data: {
          id: RINGTONE_ID,
          creator_id: "33333333-3333-4333-8333-333333333333",
          title: "Synthetic paid tone",
          price_cents: 199,
          currency: "USD",
          status: "published",
          is_personal: false,
          is_featured: false,
          is_explicit: false,
          duration_seconds: 30,
          clip_start_seconds: 0,
          clip_end_seconds: 30,
          source_song_id: null,
          description: "isolated fixture",
          published_at: "2026-01-01T00:00:00.000Z",
          created_at: "2026-01-01T00:00:00.000Z",
          artwork_url: null,
          preview_url: null,
          android_storage_path: "synthetic/paid.m4a",
          iphone_storage_path: "synthetic/paid.m4r",
          download_storage_path: "synthetic/paid.m4a",
        }, error: null });
      }
      if (table === "subscription_plans") {
        return chain(table, { data: [{
          id: "55555555-5555-4555-8555-555555555555",
          name: "Premium Listener",
          audience: "listener",
          price_cents: 699,
          currency: "USD",
          billing_interval: "month",
          features: [],
          active: true,
          sort_order: 1,
          description: "synthetic",
          stripe_price_id: null,
        }], error: null });
      }
      return chain(table, { data: null, error: null });
    },
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
  };
}
export async function safeSelect() { return []; }
`],
    ["/lib/request-auth.ts", `
const USER_ID = ${JSON.stringify(USER_ID)};
export const ACCESS_TOKEN_BODY_KEYS = ["accessToken", "access_token"];
export function getRecordString(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
export async function resolveStrictRequestUserId() {
  return { userId: USER_ID };
}
export async function requireMatchingUserId(_request, _route, claimedUserId) {
  if (claimedUserId && claimedUserId !== USER_ID) {
    return { ok: false, status: 403, error: "Authenticated user does not match requested user id." };
  }
  return { ok: true, userId: USER_ID };
}
`],
]);

export async function resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
        return {
            url: pathToFileURL(path.join(root, "node_modules/next/server.js")).href,
            shortCircuit: true,
        };
    }
    const mapped = resolveLocal(specifier, context.parentURL);
    if (!mapped) return nextResolve(specifier, context);
    return { url: mapped, shortCircuit: true };
}

export async function load(url, context, nextLoad) {
    const normalized = url.replace(/\\\\/g, "/");
    for (const [suffix, source] of mocks) {
        if (normalized.endsWith(suffix)) {
            return { format: "module", source, shortCircuit: true };
        }
    }
    return nextLoad(url, context);
}
