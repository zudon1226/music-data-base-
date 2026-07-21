/** Shared authorization helpers for paid-listener music/video downloads. */

import { isAdminUserId } from "@/lib/admin-auth";
import {
    evaluatePremiumListenerDownloadAccess,
    PREMIUM_LISTENER_DOWNLOAD_REQUIRED_MESSAGE,
} from "@/lib/billing/listener-download-access";
import { getUserSubscription } from "@/lib/billing/subscription-service";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export { PREMIUM_LISTENER_DOWNLOAD_REQUIRED_MESSAGE };

export type MediaDownloadContentType = "music" | "video";

export type MediaDownloadAuthOk = {
    ok: true;
    accessMode: "premium_listener" | "owner" | "admin";
    planName: string | null;
    planSlug: string | null;
};

export type MediaDownloadAuthDenied = {
    ok: false;
    status: number;
    error: string;
    code: string;
};

export async function authorizeMediaDownload(input: {
    userId: string;
    contentOwnerUserIds: Array<string | null | undefined>;
}): Promise<MediaDownloadAuthOk | MediaDownloadAuthDenied> {
    const userId = String(input.userId || "").trim();
    if (!userId || !isUuid(userId)) {
        return { ok: false, status: 401, error: "Authentication is required.", code: "AUTH_REQUIRED" };
    }

    if (await isAdminUserId(userId)) {
        return { ok: true, accessMode: "admin", planName: null, planSlug: null };
    }

    const ownerIds = new Set(
        input.contentOwnerUserIds
            .map((value) => String(value || "").trim())
            .filter((value) => value && isUuid(value)),
    );
    if (ownerIds.has(userId)) {
        return { ok: true, accessMode: "owner", planName: null, planSlug: null };
    }

    let subscription = null;
    try {
        subscription = await getUserSubscription(userId);
    } catch (error) {
        return {
            ok: false,
            status: 500,
            error: getErrorMessage(error) || "Unable to verify subscription.",
            code: "SUBSCRIPTION_LOOKUP_FAILED",
        };
    }

    const access = evaluatePremiumListenerDownloadAccess(subscription);
    if (!access.allowed) {
        return {
            ok: false,
            status: 403,
            error: PREMIUM_LISTENER_DOWNLOAD_REQUIRED_MESSAGE,
            code: "PREMIUM_LISTENER_REQUIRED",
        };
    }

    return {
        ok: true,
        accessMode: "premium_listener",
        planName: access.planName,
        planSlug: access.planSlug,
    };
}

function mapAccessSource(accessMode: MediaDownloadAuthOk["accessMode"] | string | null | undefined) {
    const mode = String(accessMode || "").trim().toLowerCase();
    if (mode === "owner") return "owner";
    if (mode === "admin") return "admin";
    return "paid_listener";
}

/**
 * Records one logical Download Vault entry per user/media.
 * First download inserts; later intentional downloads bump count + last_downloaded_at.
 * Never blocks a successful authorized file delivery.
 */
export async function recordMediaDownloadEvent(input: {
    userId: string;
    contentId: string;
    contentType: MediaDownloadContentType;
    filename: string;
    title?: string | null;
    accessMode?: MediaDownloadAuthOk["accessMode"] | string | null;
    planName: string | null;
    planSlug: string | null;
    deliveryStatus?: "delivered" | "failed";
}) {
    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();
    const title = String(input.title || "").trim() || String(input.filename || "").trim() || "Download";
    const accessSource = mapAccessSource(input.accessMode);
    const deliveryStatus = input.deliveryStatus || "delivered";

    try {
        const { data: prior, error: lookupError } = await supabase
            .from("media_downloads")
            .select("id,download_count")
            .eq("user_id", input.userId)
            .eq("content_id", input.contentId)
            .eq("content_type", input.contentType)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lookupError) {
            console.error("[media_downloads] lookup failed:", getErrorMessage(lookupError));
        }

        if (prior?.id) {
            const nextCount = Math.max(1, Number(prior.download_count || 1)) + 1;
            const { error: updateError } = await supabase
                .from("media_downloads")
                .update({
                    filename: input.filename,
                    title,
                    access_source: accessSource,
                    plan_name: input.planName,
                    plan_slug: input.planSlug,
                    delivery_status: deliveryStatus,
                    last_downloaded_at: now,
                    download_count: nextCount,
                })
                .eq("id", prior.id);

            if (!updateError) return;

            // Pre-migration DBs may lack new columns — still refresh filename/status.
            if (/column|access_source|last_downloaded_at|download_count|title/i.test(getErrorMessage(updateError))) {
                const { error: legacyUpdateError } = await supabase
                    .from("media_downloads")
                    .update({
                        filename: input.filename,
                        plan_name: input.planName,
                        plan_slug: input.planSlug,
                        delivery_status: deliveryStatus,
                    })
                    .eq("id", prior.id);
                if (!legacyUpdateError) return;
                console.error("[media_downloads] legacy update failed:", getErrorMessage(legacyUpdateError));
                return;
            }

            console.error("[media_downloads] update failed:", getErrorMessage(updateError));
            return;
        }

        const { error: insertError } = await supabase.from("media_downloads").insert({
            user_id: input.userId,
            content_id: input.contentId,
            content_type: input.contentType,
            filename: input.filename,
            title,
            access_source: accessSource,
            plan_name: input.planName,
            plan_slug: input.planSlug,
            delivery_status: deliveryStatus,
            last_downloaded_at: now,
            download_count: 1,
        });

        if (!insertError) return;

        if (/column|access_source|last_downloaded_at|download_count|title/i.test(getErrorMessage(insertError))) {
            const { error: legacyInsertError } = await supabase.from("media_downloads").insert({
                user_id: input.userId,
                content_id: input.contentId,
                content_type: input.contentType,
                filename: input.filename,
                plan_name: input.planName,
                plan_slug: input.planSlug,
                delivery_status: deliveryStatus,
            });
            if (!legacyInsertError) return;
            console.error("[media_downloads] legacy insert failed:", getErrorMessage(legacyInsertError));
            return;
        }

        console.error("[media_downloads] insert failed:", getErrorMessage(insertError));
    } catch (error) {
        console.error("[media_downloads] record failed:", getErrorMessage(error));
    }
}

export function isDownloadEnabledFlag(value: unknown) {
    if (value === false || value === "false" || value === 0) return false;
    return true;
}
