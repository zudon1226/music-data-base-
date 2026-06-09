import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  anonKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
};

function readSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const missing = [];

  if (!url) missing.push(REQUIRED_ENV.url);
  if (!anonKey) missing.push(REQUIRED_ENV.anonKey);

  if (missing.length > 0) {
    throw new Error(
      `Supabase is not configured. Add ${missing.join(" and ")} to .env.local, then restart the dev server.`
    );
  }

  try {
    new URL(url);
  } catch {
    throw new Error(`${REQUIRED_ENV.url} must be a valid Supabase project URL.`);
  }

  return { url, anonKey };
}

const { url, anonKey } = readSupabaseConfig();

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
