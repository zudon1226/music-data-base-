import { createClient } from "@supabase/supabase-js";
import { readSupabaseAnonKey, readSupabaseProjectUrl } from "./supabase-config";

const url = readSupabaseProjectUrl();
const anonKey = readSupabaseAnonKey();

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
