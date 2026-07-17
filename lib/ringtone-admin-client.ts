/** Client helpers for Ringtone Review Queue (Phase 4). */

import type { Session } from "@supabase/supabase-js";
import { readAccessTokenFromSession } from "@/lib/client-api-auth";

function authHeaders(session: Session | null | undefined, json = true) {
    const token = readAccessTokenFromSession(session);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (json) headers["Content-Type"] = "application/json";
    return headers;
}

async function parseJson(response: Response) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body };
}

export type RingtoneReviewItem = {
    id: string;
    creator_id: string;
    creatorLabel?: string;
    title: string;
    artwork_url: string;
    preview_url: string;
    source_kind: string;
    source_song_id: string | null;
    clip_start_seconds: number;
    clip_end_seconds: number;
    duration_seconds: number;
    price_cents: number;
    currency: string;
    status: string;
    is_explicit: boolean;
    ownership_confirmed: boolean;
    review_notes: string;
    revision_number?: number;
    last_processing_error?: string;
    last_processing_error_code?: string;
    iphoneReady?: boolean;
    androidReady?: boolean;
    previewReady?: boolean;
    processingResult?: Record<string, unknown> | null;
    updated_at: string;
    created_at: string;
    published_at?: string | null;
};

export async function fetchRingtoneReviewQueue(input: {
    userId: string;
    session: Session | null;
    status?: string;
    sort?: string;
    q?: string;
}) {
    const params = new URLSearchParams({ userId: input.userId });
    if (input.status) params.set("status", input.status);
    if (input.sort) params.set("sort", input.sort);
    if (input.q) params.set("q", input.q);
    const response = await fetch(`/api/ringtones/admin?${params.toString()}`, {
        headers: authHeaders(input.session, false),
        cache: "no-store",
    });
    const parsed = await parseJson(response);
    return {
        ok: parsed.ok,
        status: parsed.status,
        ringtones: Array.isArray(parsed.body.ringtones) ? parsed.body.ringtones as RingtoneReviewItem[] : [],
        moderationLogs: Array.isArray(parsed.body.moderationLogs) ? parsed.body.moderationLogs : [],
        error: typeof parsed.body.error === "string" ? parsed.body.error : "",
    };
}

export async function performRingtoneReviewAction(input: {
    userId: string;
    session: Session | null;
    ringtoneId: string;
    action: string;
    reason?: string;
}) {
    const response = await fetch("/api/ringtones/admin", {
        method: "POST",
        headers: authHeaders(input.session),
        body: JSON.stringify({
            userId: input.userId,
            ringtoneId: input.ringtoneId,
            action: input.action,
            reason: input.reason || "",
        }),
    });
    return parseJson(response);
}
