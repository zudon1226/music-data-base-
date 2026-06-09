import { NextResponse } from "next/server";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingRoles(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("user_roles") || message.includes("does not exist") || message.includes("schema cache");
}

export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";

    if (!userId || !isUuid(userId)) {
      return NextResponse.json({ isAdmin: false, roles: [], error: userId ? "Invalid user id." : "" }, { status: userId ? 400 : 200 });
    }

    const supabase = getSupabaseServerClient();
    const [rolesResult, profileResult] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role,status")
        .eq("user_id", userId)
        .eq("status", "active"),
      supabase
        .from("profiles")
        .select("account_type,is_admin")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .limit(1),
    ]);

    const roleRows = rolesResult.error && isMissingRoles(rolesResult.error) ? [] : rolesResult.data || [];
    if (rolesResult.error && !isMissingRoles(rolesResult.error)) {
      console.error("[api/launch/admin] roles load failed:", rolesResult.error);
      return NextResponse.json({ error: getErrorMessage(rolesResult.error), isAdmin: false, roles: [] }, { status: 500 });
    }

    const profile = (profileResult.data || [])[0] as Record<string, unknown> | undefined;
    const profileRole = typeof profile?.account_type === "string" ? profile.account_type : "";
    const roles = Array.from(new Set([
      ...roleRows.map((row) => String(row.role || "")).filter(Boolean),
      profileRole,
    ].filter(Boolean)));
    const isAdmin = roles.includes("admin") || profile?.is_admin === true;

    return NextResponse.json({
      isAdmin,
      roles,
      setupRequired: Boolean(rolesResult.error && isMissingRoles(rolesResult.error)),
    });
  } catch (error) {
    console.error("[api/launch/admin] server error:", error);
    return NextResponse.json({ error: getErrorMessage(error), isAdmin: false, roles: [] }, { status: 500 });
  }
}
