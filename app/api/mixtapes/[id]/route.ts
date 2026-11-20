import { NextResponse } from "next/server";
import { requireMixtapeOwner } from "@/lib/mixtape-access";
import { mapMixtapeRows, MIXTAPE_COLUMNS, MIXTAPE_TRACK_COLUMNS } from "@/lib/mixtape-data";
import { requireMixtapeRequestCreator, requireMixtapeRequestUser } from "@/lib/mixtape-route-auth";
import { validateMixtapeOwnedCoverStoragePath } from "@/lib/mixtape-validation";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

async function loadMixtape(mixtapeId: string) {
    return getSupabaseServerClient()
        .from("mixtapes")
        .select(MIXTAPE_COLUMNS)
        .eq("id", mixtapeId)
        .maybeSingle();
}

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid mixtape id." }, 400);
        const mixtapeResult = await loadMixtape(id);
        if (mixtapeResult.error) return jsonResponse({ error: getErrorMessage(mixtapeResult.error) }, 500);
        if (!mixtapeResult.data) return jsonResponse({ error: "Mixtape not found." }, 404);
        const mixtapeRow = mixtapeResult.data as unknown as Record<string, unknown>;
        const isPublic = mixtapeRow.status === "published" && mixtapeRow.moderation_state === "clear";
        let canManage = false;
        if (!isPublic || new URL(request.url).searchParams.get("scope") === "mine") {
            const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
            const auth = await requireMixtapeRequestUser(request, { userId }, `/api/mixtapes/${id}`);
            if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
            canManage = await requireMixtapeOwner(auth.userId, mixtapeRow.user_id).then((result) => result.ok);
            if (!isPublic && !canManage) return jsonResponse({ error: "Mixtape not found." }, 404);
        }
        const supabase = getSupabaseServerClient();
        let trackQuery = supabase
            .from("mixtape_tracks")
            .select(MIXTAPE_TRACK_COLUMNS)
            .eq("mixtape_id", id)
            .order("position", { ascending: true });
        if (!canManage) trackQuery = trackQuery.eq("status", "published");
        const trackResult = await trackQuery;
        if (trackResult.error) return jsonResponse({ error: getErrorMessage(trackResult.error) }, 500);
        const mapped = await mapMixtapeRows({
            mixtapeRows: [mixtapeRow],
            trackRows: (trackResult.data || []) as unknown as Record<string, unknown>[],
        });
        return jsonResponse({
            mixtape: canManage
                ? mapped.mixtapes[0]
                : { ...mapped.mixtapes[0], coverStoragePath: "" },
            tracks: canManage
                ? mapped.tracks
                : mapped.tracks.map((track) => ({
                    ...track,
                    mediaUrl: "",
                    storagePath: "",
                })),
            canManage,
        });
    }
    catch (error) {
        console.error("[api/mixtapes/:id] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid mixtape id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestCreator(request, body, `/api/mixtapes/${id}`);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const mixtapeResult = await loadMixtape(id);
        if (mixtapeResult.error) return jsonResponse({ error: getErrorMessage(mixtapeResult.error) }, 500);
        if (!mixtapeResult.data) return jsonResponse({ error: "Mixtape not found." }, 404);
        const mixtapeRow = mixtapeResult.data as unknown as Record<string, unknown>;
        const owner = await requireMixtapeOwner(auth.userId, mixtapeRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);

        const updates: Record<string, unknown> = {};
        if ("title" in body) {
            const title = cleanText(body.title, 160);
            if (!title) return jsonResponse({ error: "Mixtape title is required." }, 400);
            updates.title = title;
        }
        if ("description" in body) updates.description = cleanText(body.description, 8000);
        if ("genre" in body) updates.genre = cleanText(body.genre, 100);
        if ("categoryId" in body || "category_id" in body) {
            const categoryId = cleanText(body.categoryId || body.category_id, 100);
            updates.category_id = categoryId && isUuid(categoryId) ? categoryId : null;
        }
        if ("explicitContent" in body || "explicit_content" in body) {
            updates.explicit_content = Boolean(body.explicitContent ?? body.explicit_content);
        }
        if ("coverImageUrl" in body || "cover_image_url" in body) {
            updates.cover_image_url = cleanText(body.coverImageUrl || body.cover_image_url, 1000);
        }
        if ("coverStoragePath" in body || "cover_storage_path" in body) {
            const path = cleanText(body.coverStoragePath || body.cover_storage_path, 700);
            if (path && !validateMixtapeOwnedCoverStoragePath(path, String(mixtapeRow.user_id), id).ok) {
                return jsonResponse({ error: "Mixtape cover path is not owned by the creator." }, 403);
            }
            updates.cover_storage_path = path;
        }
        if ("releaseDate" in body || "release_date" in body) {
            const release = body.releaseDate ?? body.release_date;
            updates.release_date = release == null || release === ""
                ? null
                : cleanText(release, 40);
        }
        if ("status" in body) {
            const status = body.status === "published"
                ? "published"
                : body.status === "unpublished" || body.status === "draft"
                    ? "draft"
                    : body.status === "archived"
                        ? "archived"
                        : "draft";
            updates.status = status;
            updates.published_at = status === "published"
                ? String(mixtapeRow.published_at || new Date().toISOString())
                : status === "draft"
                    ? null
                    : mixtapeRow.published_at;
        }
        const result = await getSupabaseServerClient()
            .from("mixtapes")
            .update(updates)
            .eq("id", id)
            .select(MIXTAPE_COLUMNS)
            .single();
        if (result.error) return jsonResponse({ error: getErrorMessage(result.error) }, 500);
        const mapped = await mapMixtapeRows({
            mixtapeRows: [result.data as unknown as Record<string, unknown>],
            trackRows: [],
        });
        return jsonResponse({ ok: true, mixtape: mapped.mixtapes[0] });
    }
    catch (error) {
        console.error("[api/mixtapes/:id] PATCH failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await context.params;
        if (!isUuid(id)) return jsonResponse({ error: "Invalid mixtape id." }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestCreator(request, body, `/api/mixtapes/${id}`);
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        const mixtapeResult = await loadMixtape(id);
        if (mixtapeResult.error) return jsonResponse({ error: getErrorMessage(mixtapeResult.error) }, 500);
        if (!mixtapeResult.data) return jsonResponse({ error: "Mixtape not found." }, 404);
        const mixtapeRow = mixtapeResult.data as unknown as Record<string, unknown>;
        const owner = await requireMixtapeOwner(auth.userId, mixtapeRow.user_id);
        if (!owner.ok) return jsonResponse({ error: owner.error }, owner.status);
        const result = await getSupabaseServerClient()
            .from("mixtapes")
            .update({ status: "archived", published_at: null })
            .eq("id", id)
            .select(MIXTAPE_COLUMNS)
            .single();
        if (result.error) return jsonResponse({ error: getErrorMessage(result.error) }, 500);
        return jsonResponse({ ok: true, archived: true, mixtapeId: id });
    }
    catch (error) {
        console.error("[api/mixtapes/:id] DELETE failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}