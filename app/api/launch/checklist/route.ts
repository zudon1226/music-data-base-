import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import { DEFAULT_LAUNCH_CHECKLIST } from "@/lib/launch-readiness";
import { requireMatchingUserId, resolveStrictRequestUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["pending", "in_progress", "passed", "blocked"]);

function isMissingSetup(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("launch_checklist") || message.includes("does not exist") || message.includes("schema cache");
}

function fallbackChecklist(message = "Run the Phase 6 launch-readiness migration to enable persistent checklist updates.") {
  return NextResponse.json({
    checklist: DEFAULT_LAUNCH_CHECKLIST.map((item) => ({ ...item, checked_at: null })),
    setupRequired: true,
    message,
  });
}

export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
    if (!isUuid(userId)) {
      return NextResponse.json({ error: "Valid admin user id is required." }, { status: 401 });
    }
    const verified = await resolveStrictRequestUserId(request);
    if (!verified.userId) {
      return NextResponse.json({ error: verified.error || "Authentication required." }, { status: 401 });
    }
    if (verified.userId !== userId) {
      return NextResponse.json({ error: "Authorization bearer token user does not match requested user id." }, { status: 403 });
    }
    const admin = await requireAdminUserId(userId);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("launch_checklist")
      .select("id,area,status,details,checked_by,checked_at,updated_at")
      .order("area", { ascending: true });

    if (error) {
      if (isMissingSetup(error)) return fallbackChecklist();
      console.error("[api/launch/checklist] load failed:", error);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ checklist: data || [], setupRequired: false });
  } catch (error) {
    console.error("[api/launch/checklist] server error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const area = typeof body.area === "string" ? body.area.trim() : "";
    const status = typeof body.status === "string" ? body.status.trim() : "";
    const details = typeof body.details === "string" ? body.details.trim() : undefined;

    if (!isUuid(userId)) {
      return NextResponse.json({ error: "Valid admin user id is required." }, { status: 401 });
    }
    if (!area) {
      return NextResponse.json({ error: "Checklist area is required." }, { status: 400 });
    }
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Use a valid checklist status." }, { status: 400 });
    }
    const auth = await requireMatchingUserId(request, "/api/launch/checklist", userId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const admin = await requireAdminUserId(userId);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error }, { status: admin.status });
    }

    const supabase = getSupabaseServerClient();
    const updatePayload: Record<string, unknown> = {
      status,
      checked_by: userId,
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (details !== undefined) updatePayload.details = details;

    const { data, error } = await supabase
      .from("launch_checklist")
      .update(updatePayload)
      .eq("area", area)
      .select("id,area,status,details,checked_by,checked_at,updated_at")
      .single();

    if (error) {
      if (isMissingSetup(error)) {
        return NextResponse.json({ error: "Run the Phase 6 launch-readiness migration before updating checklist rows." }, { status: 409 });
      }
      console.error("[api/launch/checklist] update failed:", error);
      return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (error) {
    console.error("[api/launch/checklist] server error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
