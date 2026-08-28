import { getErrorMessage } from "@/lib/server-supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPodcastShowFollowUuid(value: string) {
    return UUID_PATTERN.test(value);
}

export function canFollowPodcastShow(input: {
    viewerUserId?: string;
    ownerUserId?: string;
}) {
    const viewerUserId = String(input.viewerUserId || "").trim();
    const ownerUserId = String(input.ownerUserId || "").trim();
    return Boolean(viewerUserId && ownerUserId && viewerUserId !== ownerUserId);
}

export function isMissingPodcastShowFollowsTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("podcast_show_follows")
        && (message.includes("does not exist") || message.includes("schema cache"));
}

export function mapPodcastShowFollowShowIds(rows: Array<{ show_id?: unknown }> | null | undefined) {
    return [...new Set(
        (rows || [])
            .map((row) => String(row.show_id || "").trim())
            .filter((id) => isPodcastShowFollowUuid(id)),
    )];
}
