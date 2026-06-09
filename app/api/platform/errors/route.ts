import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_SELECT = "id,user_id,category,action,item_id,item_type,message,details,status,created_at,resolved_at";
const VALID_CATEGORIES = new Set(["upload", "media_url", "save", "like", "playlist", "album", "storage", "backup", "follow", "unknown"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.error || JSON.stringify(record));
  }
  return "Unknown server error";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isMissingTable(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("platform_errors") || message.includes("schema cache") || message.includes("does not exist");
}

function getSupabaseServerClient() {
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

export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
    if (userId && !isUuid(userId)) {
      return jsonResponse({ error: "Invalid user id." }, 400);
    }

    const supabase = getSupabaseServerClient();
    let query = supabase
      .from("platform_errors")
      .select(ERROR_SELECT)
      .order("created_at", { ascending: false })
      .limit(100);

    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) {
        return jsonResponse({ errors: [], setupRequired: true, error: "Run the platform_errors migration to enable persistent error reports." });
      }
      console.error("[api/platform/errors] load failed:", error);
      return jsonResponse({ error: getErrorMessage(error) }, 500);
    }

    return jsonResponse({ errors: data || [] });
  } catch (error) {
    console.error("[api/platform/errors] server error:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : typeof body.user_id === "string" ? body.user_id.trim() : "";
    const rawCategory = typeof body.category === "string" ? body.category.trim() : "unknown";
    const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : "unknown";
    const action = typeof body.action === "string" ? body.action.trim() || "unknown" : "unknown";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const itemId = typeof body.itemId === "string" ? body.itemId.trim() : typeof body.item_id === "string" ? body.item_id.trim() : "";
    const itemType = typeof body.itemType === "string" ? body.itemType.trim() : typeof body.item_type === "string" ? body.item_type.trim() : "";
    const details = body.details && typeof body.details === "object" ? body.details : {};

    if (userId && !isUuid(userId)) return jsonResponse({ error: "Invalid user id." }, 400);
    if (!message) return jsonResponse({ error: "Error message is required." }, 400);

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("platform_errors")
      .insert({
        user_id: userId || null,
        category,
        action,
        item_id: itemId || null,
        item_type: itemType || null,
        message,
        details,
      })
      .select(ERROR_SELECT)
      .single();

    if (error) {
      if (isMissingTable(error)) {
        return jsonResponse({ ok: true, setupRequired: true });
      }
      console.error("[api/platform/errors] insert failed:", error);
      return jsonResponse({ error: getErrorMessage(error) }, 500);
    }

    return jsonResponse({ ok: true, error: data });
  } catch (error) {
    console.error("[api/platform/errors] server error:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
