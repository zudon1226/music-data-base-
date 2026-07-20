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

export async function recordMediaDownloadEvent(input: {
    userId: string;
    contentId: string;
    contentType: MediaDownloadContentType;
    filename: string;
    planName: string | null;
    planSlug: string | null;
    deliveryStatus?: "delivered" | "failed";
}) {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("media_downloads").insert({
        user_id: input.userId,
        content_id: input.contentId,
        content_type: input.contentType,
        filename: input.filename,
        plan_name: input.planName,
        plan_slug: input.planSlug,
        delivery_status: input.deliveryStatus || "delivered",
    });
    if (error) {
        // History must not block a successful authorized download.
        console.error("[media_downloads] insert failed:", getErrorMessage(error));
    }
}

export function isDownloadEnabledFlag(value: unknown) {
    if (value === false || value === "false" || value === 0) return false;
    return true;
}
