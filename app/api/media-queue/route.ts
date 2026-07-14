import { getErrorMessage } from "@/lib/server-supabase";
import { getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { uniqueMediaQueueItems } from "@/lib/desktop-media-queue";
import { loadMediaQueue, saveMediaQueue } from "@/lib/media-queue-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ items: [], activeIndex: -1, hydrated: false });
        }
        const auth = await requireMatchingUserId(request, "/api/media-queue", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error, items: [], activeIndex: -1, hydrated: false }, auth.status);
        }

        const loaded = await loadMediaQueue(userId);
        return jsonResponse({
            items: loaded.items,
            activeIndex: loaded.activeIndex,
            hydrated: true,
            userId,
            backend: loaded.backend,
            setupRequired: loaded.setupRequired === true,
        });
    }
    catch (error) {
        console.error("[api/media-queue] GET server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function PUT(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Log in before saving the queue." }, 401);
        }
        const auth = await requireMatchingUserId(
            request,
            "/api/media-queue",
            userId,
            getSessionTokensFromRecord(body),
        );
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        // Race protection: clients must not overwrite server data before hydration.
        if (body.queueHydrated !== true) {
            return jsonResponse({ error: "Queue not hydrated; refuse empty overwrite.", refused: true }, 409);
        }

        const incoming = uniqueMediaQueueItems(Array.isArray(body.items) ? body.items : []);
        const activeIndex = typeof body.activeIndex === "number" ? body.activeIndex : -1;
        const saved = await saveMediaQueue(userId, incoming, activeIndex);

        return jsonResponse({
            ok: true,
            items: incoming,
            activeIndex,
            userId,
            backend: saved.backend,
            setupRequired: saved.setupRequired === true,
        });
    }
    catch (error) {
        console.error("[api/media-queue] PUT server error:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
