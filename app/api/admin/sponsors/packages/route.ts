import { NextResponse } from "next/server";
import { requireAdminUserId } from "@/lib/admin-auth";
import { listAllSponsorPackages, upsertSponsorPackage } from "@/lib/sponsor-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "Admin userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/admin/sponsors/packages", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        const packages = await listAllSponsorPackages();
        return json({ ok: true, packages });
    } catch (error) {
        console.error("[api/admin/sponsors/packages] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "Admin userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/admin/sponsors/packages", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        const pkg = await upsertSponsorPackage(body);
        return json({ ok: true, package: pkg }, 201);
    } catch (error) {
        console.error("[api/admin/sponsors/packages] POST failed:", error);
        return json({ error: getErrorMessage(error) }, 400);
    }
}

export async function PATCH(request: Request) {
    return POST(request);
}

export async function DELETE(request: Request) {
    try {
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || "").trim();
        const packageId = String(body.packageId || body.id || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "Admin userId is required." }, 400);
        if (!packageId || !isUuid(packageId)) return json({ error: "packageId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/admin/sponsors/packages", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const admin = await requireAdminUserId(userId);
        if (!admin.ok) return json({ error: admin.error }, admin.status);

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("sponsor_packages")
            .update({ active: false })
            .eq("id", packageId)
            .select("*")
            .single();
        if (error) throw new Error(getErrorMessage(error));
        return json({ ok: true, package: data });
    } catch (error) {
        console.error("[api/admin/sponsors/packages] DELETE failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
