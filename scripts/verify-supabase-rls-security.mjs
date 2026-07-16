/**
 * Supabase RLS/security evidence harness.
 *
 * Default mode is read-only. Set RLS_VERIFY_MUTATIONS=1 to create three isolated
 * auth users and probe rows/files; every mutation is token-scoped and cleaned up
 * in finally. No credential value is ever included in output.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(root, "tmp");
const evidencePath = path.join(evidenceDirectory, "supabase-rls-security-evidence.json");
const { Client: PgClient } = pg;

function readLocalEnvironment() {
  try {
    const values = {};
    for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return values;
  } catch {
    return {};
  }
}

const localEnvironment = readLocalEnvironment();
const env = { ...localEnvironment, ...process.env };
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const mutationMode = env.RLS_VERIFY_MUTATIONS === "1";
const runToken = `${Date.now()}-${randomBytes(5).toString("hex")}`;
const publicReadTables = new Set([
  "songs", "videos", "artist_profiles", "producer_profiles", "producer_beats",
  "ringtone_products", "ringtone_reviews",
]);
const allBuckets = "'songs', 'videos', 'covers', 'albums', 'producer-beats', 'licenses', 'downloads', 'user-media-queues', 'ringtone-source', 'ringtone-previews', 'ringtone-downloads'";
const publicBuckets = "'songs', 'videos', 'covers', 'albums', 'producer-beats', 'ringtone-previews'";
const privateBuckets = "'licenses', 'downloads', 'user-media-queues', 'ringtone-source', 'ringtone-downloads'";
const owner = "(storage.foldername(name))[1] = auth.uid()::text";
const admin = "public.is_platform_admin()";
const storagePolicySpecifications = new Map([
  ["app_bucket_select_boundary_v2", {
    command: "SELECT", mode: "RESTRICTIVE", roles: ["anon", "authenticated"],
    using: `bucket_id not in (${allBuckets}) or bucket_id in (${publicBuckets}) or (bucket_id in (${privateBuckets}) and case when auth.role() = 'authenticated' then ${owner} or ${admin} else false end)`,
    check: null,
  }],
  ["app_bucket_insert_boundary_v2", {
    command: "INSERT", mode: "RESTRICTIVE", roles: ["anon", "authenticated"],
    using: null, check: `bucket_id not in (${allBuckets}) or ${owner} or ${admin}`,
  }],
  ["app_bucket_update_boundary_v2", {
    command: "UPDATE", mode: "RESTRICTIVE", roles: ["authenticated"],
    using: `bucket_id not in (${allBuckets}) or ${owner} or ${admin}`,
    check: `bucket_id not in (${allBuckets}) or ${owner} or ${admin}`,
  }],
  ["app_bucket_delete_boundary_v2", {
    command: "DELETE", mode: "RESTRICTIVE", roles: ["authenticated"],
    using: `bucket_id not in (${allBuckets}) or ${owner} or ${admin}`, check: null,
  }],
  ["app_public_bucket_read_v2", {
    command: "SELECT", mode: "PERMISSIVE", roles: ["anon", "authenticated"],
    using: `bucket_id in (${publicBuckets})`, check: null,
  }],
  ["app_public_bucket_owner_insert_v2", {
    command: "INSERT", mode: "PERMISSIVE", roles: ["authenticated"],
    using: null, check: `bucket_id in (${publicBuckets}) and ${owner}`,
  }],
  ["app_public_bucket_owner_update_v2", {
    command: "UPDATE", mode: "PERMISSIVE", roles: ["authenticated"],
    using: `bucket_id in (${publicBuckets}) and ${owner}`,
    check: `bucket_id in (${publicBuckets}) and ${owner}`,
  }],
  ["app_public_bucket_owner_delete_v2", {
    command: "DELETE", mode: "PERMISSIVE", roles: ["authenticated"],
    using: `bucket_id in (${publicBuckets}) and ${owner}`, check: null,
  }],
  ["app_private_bucket_owner_read_v2", {
    command: "SELECT", mode: "PERMISSIVE", roles: ["authenticated"],
    using: `bucket_id in (${privateBuckets}) and ${owner}`, check: null,
  }],
  ["app_private_bucket_owner_insert_v2", {
    command: "INSERT", mode: "PERMISSIVE", roles: ["authenticated"],
    using: null, check: `bucket_id in (${privateBuckets}) and ${owner}`,
  }],
  ["app_private_bucket_owner_update_v2", {
    command: "UPDATE", mode: "PERMISSIVE", roles: ["authenticated"],
    using: `bucket_id in (${privateBuckets}) and ${owner}`,
    check: `bucket_id in (${privateBuckets}) and ${owner}`,
  }],
  ["app_private_bucket_owner_delete_v2", {
    command: "DELETE", mode: "PERMISSIVE", roles: ["authenticated"],
    using: `bucket_id in (${privateBuckets}) and ${owner}`, check: null,
  }],
  ["app_bucket_platform_admin_full_access_v2", {
    command: "ALL", mode: "PERMISSIVE", roles: ["authenticated"],
    using: `bucket_id in (${allBuckets}) and ${admin}`,
    check: `bucket_id in (${allBuckets}) and ${admin}`,
  }],
]);

function normalizePolicyRoles(roles) {
  if (Array.isArray(roles)) return [...roles].map((role) => String(role).trim()).sort();
  const text = String(roles || "").replace(/[{}]/g, "").trim();
  if (!text) return [];
  return text.split(",").map((role) => role.trim()).filter(Boolean).sort();
}

function normalizePolicyExpression(expression) {
  if (expression == null) return null;
  let value = String(expression).toLowerCase();
  value = value.replace(/::text\b/g, "");
  value = value.replace(/::uuid\b/g, "");
  value = value.replace(/\bpublic\./g, "");
  value = value.replace(/'/g, "");
  value = value.replace(
    /bucket_id\s*<>\s*all\s*\(\s*array\s*\[([^\]]*)\]\s*\)/g,
    "bucket_idnotin[$1]",
  );
  value = value.replace(
    /bucket_id\s*=\s*any\s*\(\s*array\s*\[([^\]]*)\]\s*\)/g,
    "bucket_idin[$1]",
  );
  value = value.replace(/bucket_id\s+not\s+in\s*\(([^)]*)\)/g, "bucket_idnotin[$1]");
  value = value.replace(/bucket_id\s+in\s*\(([^)]*)\)/g, "bucket_idin[$1]");
  value = value.replace(/\s+/g, "");
  value = value.replace(/casewhen/g, "casewhen");
  value = value.replace(/[\[\]()"]/g, "");
  value = value.replace(/=anyarray/g, "in");
  value = value.replace(/<>allarray/g, "notin");
  return value;
}

const evidence = {
  generatedAt: new Date().toISOString(),
  mode: mutationMode ? "isolated-mutation-probes" : "read-only",
  configuration: {
    databaseCatalogAvailable: Boolean(databaseUrl),
    supabaseAnonAvailable: Boolean(supabaseUrl && anonKey),
    serviceRoleAvailable: Boolean(supabaseUrl && serviceRoleKey),
    secretsPrinted: false,
  },
  catalog: {
    tables: [],
    skippedPublicTables: [],
    functionPermissions: null,
    storagePolicies: [],
    storageGrants: null,
  },
  access: [],
  tests: [],
  cleanup: [],
  skipped: [],
  summary: {},
};

function safeError(error) {
  if (!error) return null;
  return {
    code: typeof error.code === "string" ? error.code : undefined,
    status: typeof error.status === "number" ? error.status : undefined,
    message: String(error.message || error).slice(0, 300),
  };
}

function isMissingApiTableError(error) {
  const code = safeError(error)?.code;
  return code === "PGRST205" || code === "42P01";
}

function isPermissionDeniedError(error) {
  const code = safeError(error)?.code;
  return code === "42501";
}

function isAnonReadDenied(error, visibleRows) {
  if (isPermissionDeniedError(error)) return true;
  return !error && (visibleRows ?? 0) === 0;
}

function isAnonMutationDenied(error, affectedRows) {
  if (isPermissionDeniedError(error)) return true;
  return !error && (affectedRows ?? 0) === 0;
}

function resolveIdempotencyDatabaseUrl(connectionString, projectSupabaseUrl) {
  try {
    const url = new URL(connectionString);
    const projectRef = projectSupabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1];
    if (!projectRef || !url.hostname.includes("pooler.supabase.com")) {
      return connectionString;
    }
    url.username = "postgres";
    url.hostname = `db.${projectRef}.supabase.co`;
    url.port = "5432";
    return url.toString();
  } catch {
    return connectionString;
  }
}

function record(name, passed, details = {}) {
  evidence.tests.push({ name, passed, ...details });
  return passed;
}

function client(key) {
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function catalogInventory() {
  if (!databaseUrl) {
    evidence.skipped.push("Catalog inventory: DATABASE_URL/SUPABASE_DB_URL/POSTGRES_URL unavailable.");
    return;
  }

  const db = new PgClient({
    connectionString: databaseUrl,
    ssl: env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    application_name: `rls-security-verifier-${runToken}`,
  });

  try {
    await db.connect();
    await db.query("begin read only");
    const tables = await db.query(`
      select
        t.table_name,
        pg_get_userbyid(c.relowner) as owner,
        pg_get_userbyid(c.relowner) = current_user as owned_by_current_user,
        c.relrowsecurity as rls_enabled,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'name', p.policyname,
              'command', p.cmd,
              'roles', p.roles,
              'using', p.qual,
              'check', p.with_check
            )
            order by p.policyname
          ) filter (where p.policyname is not null),
          '[]'::jsonb
        ) as policies,
        has_table_privilege('anon', format('%I.%I', t.table_schema, t.table_name), 'SELECT') as anon_select_grant,
        (
          has_table_privilege('anon', format('%I.%I', t.table_schema, t.table_name), 'INSERT')
          or has_table_privilege('anon', format('%I.%I', t.table_schema, t.table_name), 'UPDATE')
          or has_table_privilege('anon', format('%I.%I', t.table_schema, t.table_name), 'DELETE')
        ) as anon_any_write_grant,
        has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'SELECT') as authenticated_select_grant,
        (
          has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'INSERT')
          and has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'UPDATE')
          and has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'DELETE')
        ) as authenticated_write_grants,
        (
          has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'TRUNCATE')
          or has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'REFERENCES')
          or has_table_privilege('authenticated', format('%I.%I', t.table_schema, t.table_name), 'TRIGGER')
        ) as authenticated_dangerous_grants,
        (
          has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'SELECT')
          and has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'INSERT')
          and has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'UPDATE')
          and has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'DELETE')
        ) as service_role_crud_grants
      from information_schema.tables t
      join pg_namespace n on n.nspname = t.table_schema
      join pg_class c on c.relnamespace = n.oid and c.relname = t.table_name
      left join pg_policies p on p.schemaname = t.table_schema and p.tablename = t.table_name
      where t.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
      group by t.table_schema, t.table_name, c.relowner, c.relrowsecurity
      order by t.table_name
    `);
    evidence.catalog.tables = tables.rows.map((row) => ({
      table: row.table_name,
      owner: row.owner,
      ownedByCurrentUser: row.owned_by_current_user,
      migrationAction: row.owned_by_current_user ? "MODIFY" : "SKIP",
      migrationReason: row.owned_by_current_user
        ? "current_user owns this public table"
        : "public table is not owned by current_user; migration intentionally skips it",
      rls: row.rls_enabled ? "Yes" : "No",
      policies: row.policies,
      grants: {
        anonSelect: row.anon_select_grant,
        anonWrite: row.anon_any_write_grant,
        authenticatedSelect: row.authenticated_select_grant,
        authenticatedWrite: row.authenticated_write_grants,
        authenticatedDangerous: row.authenticated_dangerous_grants,
        serviceRoleCrud: row.service_role_crud_grants,
      },
    }));
    evidence.catalog.skippedPublicTables = evidence.catalog.tables
      .filter((table) => !table.ownedByCurrentUser)
      .map((table) => ({
        table: table.table,
        owner: table.owner,
        reason: table.migrationReason,
      }));
    const managedTables = evidence.catalog.tables.filter((table) => table.ownedByCurrentUser);
    record(
      "catalog reports RLS on every current_user-owned public base table",
      managedTables.length > 0 && managedTables.every((table) => table.rls === "Yes"),
      {
        managedTableCount: managedTables.length,
        skippedNonOwnedTableCount: evidence.catalog.skippedPublicTables.length,
      },
    );
    record(
      "catalog reports no anon table write grants on managed public tables",
      managedTables.every((table) => !table.grants.anonWrite),
      {
        failures: managedTables
          .filter((table) => table.grants.anonWrite)
          .map((table) => table.table),
      },
    );
    record(
      "authenticated has no TRUNCATE, REFERENCES, or TRIGGER grants on managed public tables",
      managedTables.every((table) => !table.grants.authenticatedDangerous),
      {
        failures: managedTables
          .filter((table) => table.grants.authenticatedDangerous)
          .map((table) => table.table),
      },
    );
    const anonGrantMismatches = managedTables
      .filter((table) => table.grants.anonSelect !== publicReadTables.has(table.table))
      .map((table) => ({
        table: table.table,
        expectedAnonSelect: publicReadTables.has(table.table),
        actualAnonSelect: table.grants.anonSelect,
      }));
    record("anon SELECT grants exactly match the public-table allowlist", anonGrantMismatches.length === 0, {
      failures: anonGrantMismatches,
    });
    const privateAnonPolicies = managedTables
      .filter((table) => !publicReadTables.has(table.table))
      .flatMap((table) => table.policies
        .filter((policy) => (policy.roles || []).some((role) => role === "anon" || role === "public"))
        .map((policy) => ({ table: table.table, policy: policy.name })));
    record("private tables have no anon/public RLS policies", privateAnonPolicies.length === 0, {
      failures: privateAnonPolicies,
    });
    record(
      "every managed public table has platform-admin full-access policy",
      managedTables.every((table) =>
        table.policies.some((policy) =>
          policy.name === "platform_admin_full_access" && policy.command === "ALL"
        )
      ),
      {
        failures: managedTables
          .filter((table) => !table.policies.some((policy) =>
            policy.name === "platform_admin_full_access" && policy.command === "ALL"
          ))
          .map((table) => table.table),
      },
    );

    const functionPermissions = await db.query(`
      select
        has_function_privilege('anon', 'public.is_platform_admin(uuid)', 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', 'public.is_platform_admin(uuid)', 'EXECUTE') as authenticated_execute,
        has_function_privilege('service_role', 'public.is_platform_admin(uuid)', 'EXECUTE') as service_role_execute
      where to_regprocedure('public.is_platform_admin(uuid)') is not null
    `);
    evidence.catalog.functionPermissions = functionPermissions.rows[0] || null;
    record(
      "is_platform_admin execute permissions are hardened",
      evidence.catalog.functionPermissions?.anon_execute === false
        && evidence.catalog.functionPermissions?.authenticated_execute === true
        && evidence.catalog.functionPermissions?.service_role_execute === true,
      { permissions: evidence.catalog.functionPermissions },
    );

    const storagePolicies = await db.query(`
      select policyname as name, cmd as command, roles, permissive, qual as using, with_check as check
      from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
      order by policyname
    `);
    evidence.catalog.storagePolicies = storagePolicies.rows;
    const storageGrants = await db.query(`
      select
        has_table_privilege('anon', 'storage.objects', 'INSERT')
          or has_table_privilege('anon', 'storage.objects', 'UPDATE')
          or has_table_privilege('anon', 'storage.objects', 'DELETE')
          or has_table_privilege('anon', 'storage.objects', 'TRUNCATE')
          or has_table_privilege('anon', 'storage.objects', 'REFERENCES')
          or has_table_privilege('anon', 'storage.objects', 'TRIGGER') as anon_unsafe,
        has_table_privilege('authenticated', 'storage.objects', 'TRUNCATE')
          or has_table_privilege('authenticated', 'storage.objects', 'REFERENCES')
          or has_table_privilege('authenticated', 'storage.objects', 'TRIGGER') as authenticated_dangerous
    `);
    evidence.catalog.storageGrants = storageGrants.rows[0] || null;
    const storagePolicyFailures = [...storagePolicySpecifications].flatMap(([name, expected]) => {
      const policy = evidence.catalog.storagePolicies.find((item) => item.name === name);
      const actualRoles = normalizePolicyRoles(policy?.roles);
      const expectedRoles = [...expected.roles].sort();
      const valid = policy
        && policy.command === expected.command
        && policy.permissive === expected.mode
        && JSON.stringify(actualRoles) === JSON.stringify(expectedRoles)
        && normalizePolicyExpression(policy.using) === normalizePolicyExpression(expected.using)
        && normalizePolicyExpression(policy.check) === normalizePolicyExpression(expected.check);
      return valid ? [] : [{ name, expected, actual: policy || null }];
    });
    const unexpectedV2Policies = evidence.catalog.storagePolicies
      .filter((policy) => policy.name.endsWith("_v2") && !storagePolicySpecifications.has(policy.name))
      .map((policy) => policy.name);
    const storagePoliciesValidated =
      storagePolicyFailures.length === 0 && unexpectedV2Policies.length === 0;
    record(
      "storage.objects has no anon writes or dangerous client grants",
      storagePoliciesValidated,
      {
        grants: evidence.catalog.storageGrants,
        enforcement: "Supabase-managed storage.objects retains catalog grants; v2 restrictive policies enforce effective access",
      },
    );
    record("all 13 Storage v2 policies exactly match reviewed definitions",
      storagePoliciesValidated, {
        expectedCount: storagePolicySpecifications.size,
        failures: storagePolicyFailures,
        unexpectedV2Policies,
      });
    await db.query("rollback");
  } catch (error) {
    evidence.skipped.push(`Catalog inventory failed: ${safeError(error)?.message}`);
    await db.query("rollback").catch(() => {});
  } finally {
    await db.end().catch(() => {});
  }
}

async function inspectTableAccess(clients) {
  if (!evidence.catalog.tables.length || !clients.anon) {
    evidence.skipped.push("Per-table API access matrix requires both catalog inventory and anon Supabase configuration.");
    return;
  }

  for (const table of evidence.catalog.tables.filter((item) => item.ownedByCurrentUser)) {
    const row = { table: table.table };
    for (const [role, supabase] of Object.entries(clients)) {
      if (!supabase) {
        row[role] = { tested: false };
        continue;
      }
      const result = await supabase.from(table.table).select("*", { head: true, count: "exact" }).limit(1);
      row[role] = {
        tested: true,
        allowed: !result.error,
        visibleRows: result.count ?? null,
        error: safeError(result.error),
      };
    }
    evidence.access.push(row);
  }

  const privateAnonLeaks = evidence.access
    .filter((row) => !publicReadTables.has(row.table) && (row.anon?.visibleRows || 0) > 0)
    .map((row) => ({ table: row.table, visibleRows: row.anon.visibleRows }));
  record("anon sees no rows from private tables", privateAnonLeaks.length === 0, {
    leaks: privateAnonLeaks,
  });

  if (clients.admin) {
    const adminFailures = evidence.access
      .filter((row) => !row.admin?.allowed)
      .map((row) => ({ table: row.table, error: row.admin?.error }));
    record("platform admin can read every public table", adminFailures.length === 0, {
      failures: adminFailures,
    });
  }
}

async function createProbeUser(admin, label) {
  const email = `rls-${label}-${runToken}@example.com`;
  const password = `Rls!${randomBytes(18).toString("base64url")}9a`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { rls_probe: runToken },
  });
  if (created.error || !created.data.user) throw created.error || new Error(`Could not create ${label}`);
  return { id: created.data.user.id, email, password };
}

async function authenticatedClient(credentials) {
  const supabase = client(anonKey);
  const signedIn = await supabase.auth.signInWithPassword(credentials);
  if (signedIn.error) throw signedIn.error;
  return supabase;
}

async function queuePolicyProbes({ anon, userA, userB, platformAdmin, service }, users) {
  const table = "user_media_queue_state";
  const availability = await service.from(table).select("user_id", { head: true, count: "exact" }).limit(0);
  if (availability.error && isMissingApiTableError(availability.error)) {
    evidence.skipped.push(
      `${table} is not exposed in the PostgREST schema cache; queue policy probes skipped until migration 005 is applied.`,
    );
    return;
  }
  if (availability.error) {
    throw availability.error;
  }

  const originalIndex = 4101;
  const ownInsert = await userA.from(table).insert({ user_id: users.a.id, active_index: originalIndex }).select("user_id,active_index").single();
  record("authenticated own insert permitted", !ownInsert.error && ownInsert.data?.user_id === users.a.id, {
    table,
    error: safeError(ownInsert.error),
  });

  const anonRead = await anon.from(table).select("user_id").eq("user_id", users.a.id);
  record("anon cannot read private probe row", isAnonReadDenied(anonRead.error, anonRead.data?.length), {
    table,
    visibleRows: anonRead.data?.length ?? null,
    error: safeError(anonRead.error),
  });

  const anonInsert = await anon.from(table).insert({ user_id: randomUUID(), active_index: 1 });
  record("anon cannot mutate protected data", Boolean(anonInsert.error), {
    table,
    error: safeError(anonInsert.error),
  });

  const anonUpdate = await anon.from(table)
    .update({ active_index: 2 })
    .eq("user_id", users.a.id)
    .select("user_id");
  record("anon cannot update protected data", isAnonMutationDenied(anonUpdate.error, anonUpdate.data?.length), {
    table,
    affectedRows: anonUpdate.data?.length ?? null,
    error: safeError(anonUpdate.error),
  });

  const anonDelete = await anon.from(table)
    .delete()
    .eq("user_id", users.a.id)
    .select("user_id");
  record("anon cannot delete protected data", isAnonMutationDenied(anonDelete.error, anonDelete.data?.length), {
    table,
    affectedRows: anonDelete.data?.length ?? null,
    error: safeError(anonDelete.error),
  });

  const crossUpdate = await userB.from(table)
    .update({ active_index: 7778 })
    .eq("user_id", users.a.id)
    .select("user_id");
  record("authenticated cross-user update denied", !crossUpdate.error && crossUpdate.data?.length === 0, {
    table,
    affectedRows: crossUpdate.data?.length ?? null,
    error: safeError(crossUpdate.error),
  });

  const crossDelete = await userB.from(table).delete().eq("user_id", users.a.id).select("user_id");
  record("authenticated cross-user delete denied", !crossDelete.error && crossDelete.data?.length === 0, {
    table,
    affectedRows: crossDelete.data?.length ?? null,
    error: safeError(crossDelete.error),
  });

  const ownUpdate = await userA.from(table)
    .update({ active_index: originalIndex + 1 })
    .eq("user_id", users.a.id)
    .select("active_index")
    .single();
  record("authenticated own update permitted", !ownUpdate.error && ownUpdate.data?.active_index === originalIndex + 1, {
    table,
    error: safeError(ownUpdate.error),
  });

  const adminRead = await platformAdmin.from(table).select("user_id,active_index").eq("user_id", users.a.id).single();
  record("platform admin can read another user row", !adminRead.error && adminRead.data?.user_id === users.a.id, {
    table,
    error: safeError(adminRead.error),
  });

  const adminUpdate = await platformAdmin.from(table)
    .update({ active_index: originalIndex + 2 })
    .eq("user_id", users.a.id)
    .select("active_index")
    .single();
  record("platform admin full access policy permits update", !adminUpdate.error && adminUpdate.data?.active_index === originalIndex + 2, {
    table,
    error: safeError(adminUpdate.error),
  });

  const finalRow = await service.from(table).select("active_index").eq("user_id", users.a.id).single();
  record("cross-user attempts left owner row intact", !finalRow.error && finalRow.data?.active_index === originalIndex + 2, {
    table,
    error: safeError(finalRow.error),
  });

  const ownDelete = await userA.from(table).delete().eq("user_id", users.a.id).select("user_id");
  record("authenticated own delete permitted", !ownDelete.error && ownDelete.data?.length === 1, {
    table,
    affectedRows: ownDelete.data?.length ?? null,
    error: safeError(ownDelete.error),
  });

  const crossInsert = await userB.from(table).insert({ user_id: users.a.id, active_index: 7777 });
  record("authenticated cross-user insert denied", Boolean(crossInsert.error), {
    table,
    error: safeError(crossInsert.error),
  });

  const afterCrossInsert = await service.from(table).select("user_id").eq("user_id", users.a.id);
  record("cross-user insert created no row", !afterCrossInsert.error && afterCrossInsert.data?.length === 0, {
    table,
    affectedRows: afterCrossInsert.data?.length ?? null,
    error: safeError(afterCrossInsert.error),
  });

  const adminInsert = await platformAdmin.from(table)
    .insert({ user_id: users.b.id, active_index: 8801 })
    .select("user_id")
    .single();
  record("platform admin full access policy permits insert", !adminInsert.error && adminInsert.data?.user_id === users.b.id, {
    table,
    error: safeError(adminInsert.error),
  });

  const adminDelete = await platformAdmin.from(table)
    .delete()
    .eq("user_id", users.b.id)
    .select("user_id");
  record("platform admin full access policy permits delete", !adminDelete.error && adminDelete.data?.length === 1, {
    table,
    affectedRows: adminDelete.data?.length ?? null,
    error: safeError(adminDelete.error),
  });
}

async function verifyStorageObjectAbsent(service, bucket, objectPath) {
  const slash = objectPath.lastIndexOf("/");
  const folder = slash >= 0 ? objectPath.slice(0, slash) : "";
  const fileName = slash >= 0 ? objectPath.slice(slash + 1) : objectPath;
  const listed = await service.storage.from(bucket).list(folder, {
    search: fileName,
    limit: 100,
  });
  const encodedPath = objectPath.split("/").map((part) => encodeURIComponent(part)).join("/");
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodedPath}?rls_probe=${encodeURIComponent(runToken)}`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      cache: "no-store",
    },
  );
  return {
    absent: !listed.error
      && !(listed.data || []).some((entry) => entry.name === fileName)
      && response.status >= 400,
    listError: safeError(listed.error),
    listed: (listed.data || []).some((entry) => entry.name === fileName),
    cacheBustedAuthenticatedStatus: response.status,
  };
}

async function verifyStorageObjectPresent(service, bucket, objectPath) {
  const slash = objectPath.lastIndexOf("/");
  const folder = slash >= 0 ? objectPath.slice(0, slash) : "";
  const fileName = slash >= 0 ? objectPath.slice(slash + 1) : objectPath;
  const listed = await service.storage.from(bucket).list(folder, {
    search: fileName,
    limit: 100,
  });
  return {
    present: !listed.error && (listed.data || []).some((entry) => entry.name === fileName),
    listError: safeError(listed.error),
  };
}

async function storagePolicyProbes({ anon, userA, userB, platformAdmin, service }, users, cleanupPaths) {
  const listed = await service.storage.listBuckets();
  if (listed.error) {
    evidence.skipped.push(`Storage probes: bucket inventory failed: ${safeError(listed.error)?.message}`);
    return;
  }

  const buckets = new Set((listed.data || []).map((bucket) => bucket.id));
  // Ringtone buckets are certified by scripts/verify-ringtone-foundation.mjs.
  // Keep them in boundary policy definitions, but out of this probe loop.
  const requiredPublicBuckets = ["songs", "videos", "covers", "albums", "producer-beats"];
  const requiredPrivateBuckets = ["licenses", "downloads"];
  const optionalPrivateBuckets = ["user-media-queues"];
  const missingRequiredBuckets = [...requiredPublicBuckets, ...requiredPrivateBuckets].filter((name) => !buckets.has(name));
  record("all required application Storage buckets exist", missingRequiredBuckets.length === 0, {
    missing: missingRequiredBuckets,
  });
  const publicBuckets = requiredPublicBuckets.filter((name) => buckets.has(name));
  const privateBuckets = [...requiredPrivateBuckets, ...optionalPrivateBuckets].filter((name) => buckets.has(name));
  const bytes = new TextEncoder().encode(`rls-probe:${runToken}`);
  const publicMimeTypes = {
    songs: "audio/mpeg",
    videos: "video/mp4",
    covers: "image/png",
    albums: "application/octet-stream",
    "producer-beats": "audio/mpeg",
    "ringtone-previews": "audio/mpeg",
  };

  if (!publicBuckets.length) {
    evidence.skipped.push("Storage public bucket probes: no configured app public bucket exists.");
  }
  for (const publicBucket of publicBuckets) {
    const extension = publicBucket === "covers" ? "png" : publicBucket === "videos" ? "mp4" : "mp3";
    const contentType = publicMimeTypes[publicBucket];
    const ownPath = `${users.a.id}/rls-probes/${runToken}.${extension}`;
    const otherPath = `${users.b.id}/rls-probes/${runToken}.${extension}`;
    const crossInsertPath = `${users.a.id}/rls-probes/cross-${runToken}.${extension}`;
    cleanupPaths.push([publicBucket, ownPath], [publicBucket, otherPath], [publicBucket, crossInsertPath]);
    const ownUpload = await userA.storage.from(publicBucket).upload(ownPath, bytes, { contentType, upsert: false });
    record("storage public-bucket own-folder write permitted", !ownUpload.error, {
      bucket: publicBucket,
      error: safeError(ownUpload.error),
    });
    const anonRead = await anon.storage.from(publicBucket).download(ownPath);
    record("storage public-bucket anon read permitted", !anonRead.error, {
      bucket: publicBucket,
      error: safeError(anonRead.error),
    });
    const anonWritePath = `${users.a.id}/rls-probes/anon-${runToken}.${extension}`;
    cleanupPaths.push([publicBucket, anonWritePath]);
    const anonWrite = await anon.storage.from(publicBucket).upload(anonWritePath, bytes, { contentType, upsert: false });
    record("storage public-bucket anon write denied", Boolean(anonWrite.error), {
      bucket: publicBucket,
      error: safeError(anonWrite.error),
    });
    const crossWrite = await userB.storage.from(publicBucket).upload(crossInsertPath, bytes, { contentType, upsert: false });
    record("storage public-bucket fresh cross-folder insert denied", Boolean(crossWrite.error), {
      bucket: publicBucket,
      error: safeError(crossWrite.error),
    });
    const crossUpdate = await userB.storage.from(publicBucket).update(ownPath, bytes, { contentType, upsert: true });
    record("storage public-bucket cross-folder update denied", Boolean(crossUpdate.error), {
      bucket: publicBucket,
      error: safeError(crossUpdate.error),
    });
    const crossDelete = await userB.storage.from(publicBucket).remove([ownPath]);
    const afterCrossDelete = await verifyStorageObjectPresent(service, publicBucket, ownPath);
    record("storage public-bucket cross-folder delete denied", afterCrossDelete.present, {
      bucket: publicBucket,
      apiError: safeError(crossDelete.error),
      verification: afterCrossDelete,
    });
    const adminWrite = await platformAdmin.storage.from(publicBucket).upload(otherPath, bytes, { contentType, upsert: false });
    record("storage platform admin write permitted", !adminWrite.error, {
      bucket: publicBucket,
      error: safeError(adminWrite.error),
    });
    const adminUpdate = await platformAdmin.storage.from(publicBucket).update(otherPath, bytes, { contentType, upsert: true });
    record("storage platform admin update permitted", !adminUpdate.error, {
      bucket: publicBucket,
      error: safeError(adminUpdate.error),
    });
    const adminDelete = await platformAdmin.storage.from(publicBucket).remove([otherPath]);
    record("storage platform admin delete permitted", !adminDelete.error, {
      bucket: publicBucket,
      error: safeError(adminDelete.error),
    });
    const adminDeleteAbsence = await verifyStorageObjectAbsent(service, publicBucket, otherPath);
    record("storage platform admin delete removes public-bucket object", adminDeleteAbsence.absent, {
      bucket: publicBucket,
      verification: adminDeleteAbsence,
    });
    const ownUpdate = await userA.storage.from(publicBucket).update(ownPath, bytes, { contentType, upsert: true });
    record("storage public-bucket own-folder update permitted", !ownUpdate.error, {
      bucket: publicBucket,
      error: safeError(ownUpdate.error),
    });
    const ownDelete = await userA.storage.from(publicBucket).remove([ownPath]);
    record("storage public-bucket own-folder delete permitted", !ownDelete.error, {
      bucket: publicBucket,
      error: safeError(ownDelete.error),
    });
    const ownDeleteAbsence = await verifyStorageObjectAbsent(service, publicBucket, ownPath);
    record("storage owner delete removes public-bucket object", ownDeleteAbsence.absent, {
      bucket: publicBucket,
      verification: ownDeleteAbsence,
    });
  }

  if (!privateBuckets.length) {
    evidence.skipped.push("Storage private bucket probes: no configured app private bucket exists.");
  }
  const privateMimeTypes = {
    licenses: "application/pdf",
    downloads: "application/octet-stream",
    "user-media-queues": "application/json",
    "ringtone-source": "audio/mpeg",
    "ringtone-downloads": "audio/mpeg",
  };
  const privateExtensions = {
    licenses: "pdf",
    downloads: "bin",
    "user-media-queues": "json",
    "ringtone-source": "mp3",
    "ringtone-downloads": "mp3",
  };

  for (const privateBucket of privateBuckets) {
    const privateContentType = privateMimeTypes[privateBucket] || "application/octet-stream";
    const extension = privateExtensions[privateBucket] || "bin";
    const ownPath = `${users.a.id}/rls-probes/${runToken}.${extension}`;
    const adminPath = `${users.b.id}/rls-probes/admin-${runToken}.${extension}`;
    const crossInsertPath = `${users.a.id}/rls-probes/cross-${runToken}.${extension}`;
    cleanupPaths.push([privateBucket, ownPath], [privateBucket, adminPath], [privateBucket, crossInsertPath]);
    const ownUpload = await userA.storage.from(privateBucket).upload(ownPath, bytes, { contentType: privateContentType, upsert: false });
    record("storage private-bucket own-folder write permitted", !ownUpload.error, {
      bucket: privateBucket,
      error: safeError(ownUpload.error),
    });
    const ownRead = await userA.storage.from(privateBucket).download(ownPath);
    record("storage private-bucket owner read permitted", !ownRead.error, {
      bucket: privateBucket,
      error: safeError(ownRead.error),
    });
    const anonRead = await anon.storage.from(privateBucket).download(ownPath);
    record("storage private-bucket anon read denied", Boolean(anonRead.error), {
      bucket: privateBucket,
      error: safeError(anonRead.error),
    });
    const anonWritePath = `${users.a.id}/rls-probes/anon-${runToken}.${extension}`;
    cleanupPaths.push([privateBucket, anonWritePath]);
    const anonWrite = await anon.storage.from(privateBucket).upload(anonWritePath, bytes, { contentType: privateContentType, upsert: false });
    record("storage private-bucket anon write denied", Boolean(anonWrite.error), {
      bucket: privateBucket,
      error: safeError(anonWrite.error),
    });
    const crossRead = await userB.storage.from(privateBucket).download(ownPath);
    record("storage private-bucket cross-user read denied", Boolean(crossRead.error), {
      bucket: privateBucket,
      error: safeError(crossRead.error),
    });
    const crossWrite = await userB.storage.from(privateBucket).upload(crossInsertPath, bytes, { contentType: privateContentType, upsert: false });
    record("storage private-bucket fresh cross-folder insert denied", Boolean(crossWrite.error), {
      bucket: privateBucket,
      error: safeError(crossWrite.error),
    });
    const crossUpdate = await userB.storage.from(privateBucket).update(ownPath, bytes, { contentType: privateContentType, upsert: true });
    record("storage private-bucket cross-folder update denied", Boolean(crossUpdate.error), {
      bucket: privateBucket,
      error: safeError(crossUpdate.error),
    });
    const crossDelete = await userB.storage.from(privateBucket).remove([ownPath]);
    const afterCrossDelete = await verifyStorageObjectPresent(service, privateBucket, ownPath);
    record("storage private-bucket cross-folder delete denied", afterCrossDelete.present, {
      bucket: privateBucket,
      apiError: safeError(crossDelete.error),
      verification: afterCrossDelete,
    });
    const adminRead = await platformAdmin.storage.from(privateBucket).download(ownPath);
    record("storage platform admin private read permitted", !adminRead.error, {
      bucket: privateBucket,
      error: safeError(adminRead.error),
    });
    const adminWrite = await platformAdmin.storage.from(privateBucket).upload(adminPath, bytes, { contentType: privateContentType, upsert: false });
    record("storage platform admin private write permitted", !adminWrite.error, {
      bucket: privateBucket,
      error: safeError(adminWrite.error),
    });
    const adminUpdate = await platformAdmin.storage.from(privateBucket).update(adminPath, bytes, { contentType: privateContentType, upsert: true });
    record("storage platform admin private update permitted", !adminUpdate.error, {
      bucket: privateBucket,
      error: safeError(adminUpdate.error),
    });
    const adminDelete = await platformAdmin.storage.from(privateBucket).remove([adminPath]);
    record("storage platform admin private delete permitted", !adminDelete.error, {
      bucket: privateBucket,
      error: safeError(adminDelete.error),
    });
    const adminDeleteAbsence = await verifyStorageObjectAbsent(service, privateBucket, adminPath);
    record("storage platform admin delete removes private-bucket object", adminDeleteAbsence.absent, {
      bucket: privateBucket,
      verification: adminDeleteAbsence,
    });
    const ownUpdate = await userA.storage.from(privateBucket).update(ownPath, bytes, { contentType: privateContentType, upsert: true });
    record("storage private-bucket own-folder update permitted", !ownUpdate.error, {
      bucket: privateBucket,
      error: safeError(ownUpdate.error),
    });
    const ownDelete = await userA.storage.from(privateBucket).remove([ownPath]);
    record("storage private-bucket own-folder delete permitted", !ownDelete.error, {
      bucket: privateBucket,
      error: safeError(ownDelete.error),
    });
    const ownDeleteAbsence = await verifyStorageObjectAbsent(service, privateBucket, ownPath);
    record("storage owner delete removes private-bucket object", ownDeleteAbsence.absent, {
      bucket: privateBucket,
      verification: ownDeleteAbsence,
    });
  }

}

async function verifyCorrectedMigrationIdempotency() {
  if (!mutationMode || !databaseUrl) {
    evidence.skipped.push(
      "004 idempotency check requires DATABASE_URL and RLS_VERIFY_MUTATIONS=1.",
    );
    return;
  }

  const migrationPath = path.join(
    root,
    "supabase",
    "migrations",
    "202607140005_fix_rls_verification_gaps.sql",
  );
  const migrationSql = readFileSync(migrationPath, "utf8");
  const idempotencyDatabaseUrl = resolveIdempotencyDatabaseUrl(databaseUrl, supabaseUrl);
  const db = new PgClient({
    connectionString: idempotencyDatabaseUrl,
    ssl: env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    application_name: `rls-005-idempotency-${runToken}`,
  });
  let transactionStarted = false;

  try {
    await db.connect();
    await db.query("begin");
    transactionStarted = true;
    await db.query(migrationSql);
    await db.query(migrationSql);
    await db.query("rollback");
    transactionStarted = false;
    record("corrected 004 executes twice idempotently inside a rolled-back transaction", true, {
      migration: path.relative(root, migrationPath),
      executions: 2,
      rolledBack: true,
      failed003Executed: false,
    });
  } catch (error) {
    if (transactionStarted) {
      await db.query("rollback").catch(() => {});
      transactionStarted = false;
    }
    record("corrected 004 executes twice idempotently inside a rolled-back transaction", false, {
      migration: path.relative(root, migrationPath),
      executionsAttempted: 2,
      rolledBack: true,
      failed003Executed: false,
      error: safeError(error),
    });
  } finally {
    if (transactionStarted) await db.query("rollback").catch(() => {});
    await db.end().catch(() => {});
  }
}

async function mutationProbes(baseClients) {
  if (!mutationMode) {
    evidence.skipped.push("Mutation probes disabled; set RLS_VERIFY_MUTATIONS=1 to run isolated create/test/cleanup checks.");
    return;
  }
  if (!baseClients.anon || !baseClients.service) {
    evidence.skipped.push("Mutation probes require Supabase URL, anon key, and service-role key.");
    return;
  }

  const users = {};
  const storageCleanup = [];
  try {
    users.a = await createProbeUser(baseClients.service, "user-a");
    users.b = await createProbeUser(baseClients.service, "user-b");
    users.admin = await createProbeUser(baseClients.service, "admin");

    const adminRole = await baseClients.service.from("user_roles").insert({
      user_id: users.admin.id,
      role: "admin",
      status: "active",
    });
    if (adminRole.error) throw adminRole.error;

    const clients = {
      ...baseClients,
      userA: await authenticatedClient(users.a),
      userB: await authenticatedClient(users.b),
      platformAdmin: await authenticatedClient(users.admin),
    };

    await inspectTableAccess({
      anon: clients.anon,
      authenticated: clients.userA,
      admin: clients.platformAdmin,
      serviceRole: clients.service,
    });
    await queuePolicyProbes(clients, users);
    await storagePolicyProbes(clients, users, storageCleanup);
  } catch (error) {
    record("mutation probe setup/completion", false, { error: safeError(error) });
  } finally {
    for (const [bucket, objectPath] of storageCleanup) {
      const result = await baseClients.service.storage.from(bucket).remove([objectPath]);
      evidence.cleanup.push({
        target: `storage:${bucket}:probe-object`,
        success: !result.error,
        error: safeError(result.error),
      });
    }

    if (users.a?.id) {
      const result = await baseClients.service.from("user_media_queue_state").delete().eq("user_id", users.a.id);
      evidence.cleanup.push({
        target: "user_media_queue_state:user-a",
        success: !result.error || isMissingApiTableError(result.error),
        error: safeError(result.error),
      });
    }
    for (const [label, user] of Object.entries(users)) {
      if (!user?.id) continue;
      const result = await baseClients.service.auth.admin.deleteUser(user.id);
      evidence.cleanup.push({ target: `auth-user:${label}`, success: !result.error, error: safeError(result.error) });
    }
  }
}

async function main() {
  await verifyCorrectedMigrationIdempotency();
  await catalogInventory();

  const baseClients = {
    anon: supabaseUrl && anonKey ? client(anonKey) : null,
    service: supabaseUrl && serviceRoleKey ? client(serviceRoleKey) : null,
  };

  if (!mutationMode) {
    await inspectTableAccess({
      anon: baseClients.anon,
      authenticated: null,
      admin: null,
      serviceRole: baseClients.service,
    });
  }
  await mutationProbes(baseClients);

  const failures = evidence.tests.filter((test) => !test.passed);
  const managedTables = evidence.catalog.tables.filter((table) => table.ownedByCurrentUser);
  const rlsFailures = managedTables.filter((table) => table.rls !== "Yes");
  const cleanupFailures = evidence.cleanup.filter((item) => !item.success);
  evidence.summary = {
    publicTableCount: evidence.catalog.tables.length,
    managedPublicTableCount: managedTables.length,
    skippedNonOwnedPublicTableCount: evidence.catalog.skippedPublicTables.length,
    allManagedPublicTablesHaveRls: managedTables.length > 0 && rlsFailures.length === 0,
    testsRun: evidence.tests.length,
    testsPassed: evidence.tests.length - failures.length,
    testsFailed: failures.length,
    cleanupFailed: cleanupFailures.length,
    skipped: evidence.skipped.length,
    pass: managedTables.length > 0
      && mutationMode
      && evidence.skipped.length === 0
      && failures.length === 0
      && rlsFailures.length === 0
      && cleanupFailures.length === 0,
  };

  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = evidence.summary.pass ? 0 : 1;
}

main().catch((error) => {
  const fatal = {
    generatedAt: new Date().toISOString(),
    fatal: safeError(error),
    secretsPrinted: false,
  };
  console.log(JSON.stringify(fatal, null, 2));
  process.exitCode = 1;
});
