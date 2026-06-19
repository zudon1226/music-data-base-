import { createClient } from "@supabase/supabase-js";
import { readSupabaseAnonKey, resolveSupabaseLoginUrl } from "./supabase-config";

/** Final Supabase project URL used by browser auth (signIn, session, refresh). */
export const supabaseLoginUrl = resolveSupabaseLoginUrl();
const anonKey = readSupabaseAnonKey();

export const supabase = createClient(supabaseLoginUrl, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
