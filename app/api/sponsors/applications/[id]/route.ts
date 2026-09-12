import { NextResponse } from "next/server";
import {
    getSponsorApplication,
    updateSponsorApplicationByUser,
} from "@/lib/sponsor-service";
import { requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid application id." }, 400);
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/sponsors/applications/[id]", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const application = await getSponsorApplication(id, userId);
        if (!application) return json({ error: "Application not found." }, 404);
        return json({ application });
    } catch (error) {
        console.error("[api/sponsors/applications/:id] GET failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}

export async function PATCH(request: Request, context: Params) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return json({ error: "Invalid application id." }, 400);
        const body = await request.json().catch(() => ({})) as Record<string, unknown>;
        const userId = String(body.userId || body.sessionUserId || "").trim();
        if (!userId || !isUuid(userId)) return json({ error: "userId is required." }, 400);
        const auth = await requireMatchingUserId(request, "/api/sponsors/applications/[id]", userId);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        const application = await updateSponsorApplicationByUser({
            applicationId: id,
            userId,
            updates: body,
        });
        return json({ application });
    } catch (error) {
        console.error("[api/sponsors/applications/:id] PATCH failed:", error);
        return json({ error: getErrorMessage(error) }, 400);
    }
}
