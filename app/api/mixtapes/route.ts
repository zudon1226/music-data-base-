import { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin-auth";
import { filterPublicCatalogRows } from "@/lib/moderation-status.mjs";
import { mapMixtapeRows, MIXTAPE_COLUMNS, MIXTAPE_TRACK_COLUMNS } from "@/lib/mixtape-data";
import { requireMixtapeRequestCreator } from "@/lib/mixtape-route-auth";
import { isTrackShapedMixtapePayload, validateMixtapeOwnedCoverStoragePath } from "@/lib/mixtape-validation";
import {
    clampMineCatalogLimit,
    decodeMineCatalogCursor,
    encodeMineCatalogCursor,
    mineCatalogCursorOrFilter,
} from "@/lib/mixtape-mine-catalog-pagination.mjs";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isMixtapeSetupMissing(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("mixtapes")
        && (message.includes("does not exist") || message.includes("schema cache"));
}

function cleanText(value: unknown, maxLength: number) {
    return String(value || "").trim().slice(0, maxLength);
}

function serializePublicTrack<T extends Record<string, unknown>>(track: T) {
    return {
        ...track,
        mediaUrl: "",
        storagePath: "",
    };
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const scopeParam = url.searchParams.get("scope")?.trim().toLowerCase() || "public";
        const scope = scopeParam === "mine" || scopeParam === "featured" ? scopeParam : "public";
        const userId = url.searchParams.get("userId")?.trim() || "";
        const limit = scope === "mine"
            ? clampMineCatalogLimit(url.searchParams.get("limit"))
            : Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 60)));
        const cursorToken = String(url.searchParams.get("cursor") || "").trim();
        let mineIsAdmin = false;
        if (scope === "mine") {
            const auth = await requireMixtapeRequestCreator(request, { userId }, "/api/mixtapes");
            if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
            mineIsAdmin = await isAdminUserId(auth.userId);
        }

        const supabase = getSupabaseServerClient();
        let mixtapeQuery = supabase.from("mixtapes").select(MIXTAPE_COLUMNS);
        if (scope === "mine") {
            mixtapeQuery = mixtapeQuery
                .order("updated_at", { ascending: false })
                .order("id", { ascending: false })
                .limit(limit + 1);
            const cursor = cursorToken ? decodeMineCatalogCursor(cursorToken) : null;
            if (cursorToken && !cursor) {
                return jsonResponse({ error: "Invalid catalog cursor.", mixtapes: [], tracks: [] }, 400);
            }
            if (cursor) mixtapeQuery = mixtapeQuery.or(mineCatalogCursorOrFilter(cursor));
        }
        else {
            mixtapeQuery = mixtapeQuery
                .order("published_at", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false })
                .limit(limit);
        }
        if (scope === "mine" && !mineIsAdmin) mixtapeQuery = mixtapeQuery.eq("user_id", userId);
        else if (scope === "public") mixtapeQuery = mixtapeQuery.eq("status", "published");
        else if (scope === "featured") {
            mixtapeQuery = mixtapeQuery
                .eq("status", "published")
                .eq("is_featured", true)
                .eq("moderation_state", "clear");
        }
        const mixtapeResult = await mixtapeQuery;
        if (mixtapeResult.error) {
            return jsonResponse({
                error: getErrorMessage(mixtapeResult.error),
                setupRequired: isMixtapeSetupMissing(mixtapeResult.error),
                mixtapes: [],
                tracks: [],
                categories: [],
            }, isMixtapeSetupMissing(mixtapeResult.error) ? 409 : 500);
        }
        let mixtapeRows = (mixtapeResult.data || []) as unknown as Record<string, unknown>[];
        let hasMore = false;
        let nextCursor = "";
        if (scope === "mine") {
            hasMore = mixtapeRows.length > limit;
            if (hasMore) mixtapeRows = mixtapeRows.slice(0, limit);
            if (hasMore && mixtapeRows.length > 0) {
                nextCursor = encodeMineCatalogCursor(mixtapeRows[mixtapeRows.length - 1]);
            }
        }
        const mixtapeIds = mixtapeRows.map((mixtape) => String(mixtape.id || "")).filter(Boolean);
        let trackRows: Record<string, unknown>[] = [];
        if (mixtapeIds.length > 0) {
            let trackQuery = supabase
                .from("mixtape_tracks")
                .select(MIXTAPE_TRACK_COLUMNS)
                .in("mixtape_id", mixtapeIds)
                .order("position", { ascending: true })
                .limit(limit * 8);
            if (scope === "mine" && !mineIsAdmin) trackQuery = trackQuery.eq("user_id", userId);
            else if (scope === "public" || scope === "featured") trackQuery = trackQuery.eq("status", "published");
            const trackResult = await trackQuery;
            if (trackResult.error) {
                return jsonResponse({ error: getErrorMessage(trackResult.error), mixtapes: [], tracks: [] }, 500);
            }
            trackRows = scope === "public" || scope === "featured"
                ? filterPublicCatalogRows((trackResult.data || []) as unknown as Record<string, unknown>[])
                : (trackResult.data || []) as unknown as Record<string, unknown>[];
        }
        const mapped = await mapMixtapeRows({
            mixtapeRows,
            trackRows,
            publishedOnly: scope === "public" || scope === "featured",
        });
        const responseBody: Record<string, unknown> = {
            mixtapes: scope === "public" || scope === "featured"
                ? mapped.mixtapes.map((mixtape) => ({ ...mixtape, coverStoragePath: "" }))
                : mapped.mixtapes,
            tracks: scope === "public" || scope === "featured"
                ? mapped.tracks.map((track) => serializePublicTrack(track as unknown as Record<string, unknown>))
                : mapped.tracks,
            categories: mapped.categories,
        };
        if (scope === "mine") {
            responseBody.hasMore = hasMore;
            responseBody.nextCursor = nextCursor;
            responseBody.pageSize = limit;
        }
        return jsonResponse(responseBody);
    }
    catch (error) {
        console.error("[api/mixtapes] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), mixtapes: [], tracks: [] }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const auth = await requireMixtapeRequestCreator(request, body, "/api/mixtapes");
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
        if (isTrackShapedMixtapePayload(body)) {
            return jsonResponse({
                error: "Track creation must use /api/mixtapes/tracks with an existing mixtape_id. This endpoint creates a mixtape only.",
            }, 400);
        }
        const title = cleanText(body.title, 160);
        if (!title) return jsonResponse({ error: "Mixtape title is required." }, 400);
        const categoryId = cleanText(body.categoryId || body.category_id, 100);
        const coverStoragePath = cleanText(body.coverStoragePath || body.cover_storage_path, 700);
        const status = body.status === "published" ? "published" : "draft";
        const now = new Date().toISOString();
        const supabase = getSupabaseServerClient();
        const payload = {
            user_id: auth.userId,
            title,
            description: cleanText(body.description, 8000),
            category_id: categoryId && isUuid(categoryId) ? categoryId : null,
            genre: cleanText(body.genre, 100),
            explicit_content: Boolean(body.explicitContent ?? body.explicit_content),
            cover_image_url: cleanText(body.coverImageUrl || body.cover_image_url, 1000),
            cover_storage_path: "",
            status,
            published_at: status === "published" ? now : null,
            release_date: body.releaseDate || body.release_date
                ? cleanText(body.releaseDate || body.release_date, 40)
                : null,
        };
        const inserted = await supabase
            .from("mixtapes")
            .insert(payload)
            .select(MIXTAPE_COLUMNS)
            .single();
        if (inserted.error) {
            return jsonResponse({
                error: getErrorMessage(inserted.error),
                setupRequired: isMixtapeSetupMissing(inserted.error),
            }, isMixtapeSetupMissing(inserted.error) ? 409 : 500);
        }
        const mixtapeRow = inserted.data as unknown as Record<string, unknown>;
        const mixtapeId = String(mixtapeRow.id || "");
        if (coverStoragePath) {
            const ownerPath = validateMixtapeOwnedCoverStoragePath(coverStoragePath, auth.userId, mixtapeId);
            if (!ownerPath.ok) return jsonResponse({ error: ownerPath.error }, 403);
            const updated = await supabase
                .from("mixtapes")
                .update({ cover_storage_path: ownerPath.storagePath })
                .eq("id", mixtapeId)
                .select(MIXTAPE_COLUMNS)
                .single();
            if (updated.error) return jsonResponse({ error: getErrorMessage(updated.error) }, 500);
            const mapped = await mapMixtapeRows({
                mixtapeRows: [updated.data as unknown as Record<string, unknown>],
                trackRows: [],
            });
            return jsonResponse({ ok: true, mixtape: mapped.mixtapes[0] }, 201);
        }
        const mapped = await mapMixtapeRows({ mixtapeRows: [mixtapeRow], trackRows: [] });
        return jsonResponse({ ok: true, mixtape: mapped.mixtapes[0] }, 201);
    }
    catch (error) {
        console.error("[api/mixtapes] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}