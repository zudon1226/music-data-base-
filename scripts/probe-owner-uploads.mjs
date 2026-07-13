/**
 * Local-only: count owner-owned songs/videos in DB (no content dump).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[line.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnvLocal();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const uid = "33564e29-6f65-4efd-8a27-6b58bc45a455";

const songsByUser = await sb.from("songs").select("id,title,user_id", { count: "exact" }).eq("user_id", uid);
const videosByUser = await sb.from("videos").select("id,title,user_id", { count: "exact" }).eq("user_id", uid);
const songsCols = await sb.from("songs").select("*").limit(1);
const videosCols = await sb.from("videos").select("*").limit(1);
const { data: roles } = await sb.from("user_roles").select("role,status").eq("user_id", uid);
const { data: profile } = await sb
  .from("profiles")
  .select("account_type,is_admin,display_name")
  .or(`id.eq.${uid},user_id.eq.${uid}`)
  .maybeSingle();

console.log(
  JSON.stringify(
    {
      songsOwnedCount: songsByUser.count ?? (songsByUser.data || []).length,
      songsOwnedTitles: (songsByUser.data || []).map((s) => ({
        idType: typeof s.id,
        titlePresent: Boolean(s.title),
      })),
      videosOwnedCount: videosByUser.count ?? (videosByUser.data || []).length,
      videosOwnedTitles: (videosByUser.data || []).map((v) => ({
        idType: typeof v.id,
        titlePresent: Boolean(v.title),
      })),
      songColumnNames: songsCols.data?.[0] ? Object.keys(songsCols.data[0]) : [],
      videoColumnNames: videosCols.data?.[0] ? Object.keys(videosCols.data[0]) : [],
      songSelectError: songsByUser.error?.message || null,
      videoSelectError: videosByUser.error?.message || null,
      roles,
      profile: {
        account_type: profile?.account_type,
        is_admin: profile?.is_admin,
        displayNamePresent: Boolean(profile?.display_name),
      },
    },
    null,
    2,
  ),
);
