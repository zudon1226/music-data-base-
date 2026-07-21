import { NextResponse } from "next/server";
import { getBearerToken, requireMatchingUserId } from "@/lib/request-auth";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type MediaDownloadRow = {
    id: string;
    user_id: string;
    content_id: string;
    content_type: "music" | "video";
    title: string | null;
    filename: string;
    access_source: string | null;
    plan_name: string | null;
    plan_slug: string | null;
    delivery_status: string;
    download_count: number | null;
    last_downloaded_at: string | null;
    created_at: string;
};

function normalizeAccessSource(value: string | null | undefined) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "owner" || raw === "admin" || raw === "paid_listener" || raw === "premium_listener") {
        return raw === "premium_listener" ? "paid_listener" : raw;
    }
    return "paid_listener";
}

/**
 * Lists the authenticated user's media-download vault entries
 * (paid-listener / owner / admin music & video downloads).
 */
export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const userId = String(url.searchParams.get("userId") || "").trim();
        if (!userId || !isUuid(userId)) {
            return json({ error: "Authentication is required.", items: [], code: "AUTH_REQUIRED" }, 401);
        }

        if (!getBearerToken(request)) {
            return json({ error: "Authentication is required.", items: [], code: "AUTH_REQUIRED" }, 401);
        }
        const auth = await requireMatchingUserId(request, "/api/media-downloads", userId);
        if (!auth.ok) {
            return json({ error: auth.error, items: [], code: "AUTH_REQUIRED" }, auth.status);
        }

        const supabase = getSupabaseServerClient();
        const { data, error } = await supabase
            .from("media_downloads")
            .select(
                "id,user_id,content_id,content_type,title,filename,access_source,plan_name,plan_slug,delivery_status,download_count,last_downloaded_at,created_at",
            )
            .eq("user_id", userId)
            .eq("delivery_status", "delivered")
            .order("last_downloaded_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) {
            // Older DBs may lack the vault columns until migration is applied.
            const missingColumn = /column .* does not exist|last_downloaded_at|access_source|download_count|title/i.test(
                getErrorMessage(error),
            );
            if (!missingColumn) {
                return json({ error: getErrorMessage(error), items: [] }, 500);
            }

            const fallback = await supabase
                .from("media_downloads")
                .select("id,user_id,content_id,content_type,filename,plan_name,plan_slug,delivery_status,created_at")
                .eq("user_id", userId)
                .eq("delivery_status", "delivered")
                .order("created_at", { ascending: false })
                .limit(200);
            if (fallback.error) {
                return json({ error: getErrorMessage(fallback.error), items: [] }, 500);
            }

            const deduped = new Map<string, Record<string, unknown>>();
            for (const row of fallback.data || []) {
                const key = `${row.user_id}-${row.content_type}-${row.content_id}`;
                if (!deduped.has(key)) {
                    deduped.set(key, {
                        id: row.id,
                        userId: row.user_id,
                        contentId: row.content_id,
                        contentType: row.content_type,
                        mediaType: row.content_type === "video" ? "video" : "song",
                        title: String(row.filename || "Download"),
                        filename: String(row.filename || "Download"),
                        accessSource: "paid_listener",
                        planName: row.plan_name,
                        planSlug: row.plan_slug,
                        downloadCount: 1,
                        downloadedAt: row.created_at,
                        sourceLabel: "Paid listener download",
                    });
                }
            }
            return json({ items: [...deduped.values()], hydrated: true });
        }

        const items = ((data || []) as MediaDownloadRow[]).map((row) => {
            const accessSource = normalizeAccessSource(row.access_source);
            const downloadedAt = row.last_downloaded_at || row.created_at;
            return {
                id: row.id,
                userId: row.user_id,
                contentId: row.content_id,
                contentType: row.content_type,
                mediaType: row.content_type === "video" ? "video" : "song",
                title: String(row.title || row.filename || "Download"),
                filename: String(row.filename || "Download"),
                accessSource,
                planName: row.plan_name,
                planSlug: row.plan_slug,
                downloadCount: Math.max(1, Number(row.download_count || 1)),
                downloadedAt,
                sourceLabel:
                    accessSource === "owner"
                        ? "Owner download"
                        : accessSource === "admin"
                            ? "Admin download"
                            : "Paid listener download",
            };
        });

        return json({ items, hydrated: true });
    } catch (error) {
        console.error("[api/media-downloads] GET failed:", error);
        return json({ error: getErrorMessage(error), items: [] }, 500);
    }
}
