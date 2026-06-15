import { createClient } from "@supabase/supabase-js";

export const PLATFORM_OWNER_EMAIL = "zudon1226@gmail.com";

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.error || JSON.stringify(record));
  }
  return "Unknown server error";
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function isPlatformOwnerEmail(email: unknown) {
  return String(email || "").trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
}

export function getPublicSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
}

export function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function isPlatformOwnerUserId(userId: string) {
  if (!userId || !isUuid(userId)) return false;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) return false;
  return isPlatformOwnerEmail(data.user?.email);
}

export async function safeSelect<T extends Record<string, unknown>>(
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const { data, error } = await query;
  if (error) {
    const message = getErrorMessage(error).toLowerCase();
    if (message.includes("does not exist") || message.includes("schema cache")) return [];
    throw error;
  }
  return data || [];
}
