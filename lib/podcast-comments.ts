import { getSupabaseServerClient } from "@/lib/server-supabase";

export const PODCAST_COMMENT_MAX_LENGTH = 2000;
export const PODCAST_COMMENT_REPORT_PREFIX = "Podcast comment report";
export const PODCAST_COMMENT_TITLE_PREFIX = "Podcast comment:";

export type PodcastEpisodeComment = {
    id: string;
    episodeId: string;
    userId: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    authorName: string;
    avatarUrl: string;
    canDelete: boolean;
    canReport: boolean;
};

export function cleanPodcastCommentBody(value: unknown) {
    return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, PODCAST_COMMENT_MAX_LENGTH);
}

export function podcastCommentTitle(body: string, episodeTitle = "", episodeId = "") {
    const excerpt = body.replace(/\s+/g, " ").trim().slice(0, 80) || "Comment";
    const episodeLabel = [episodeTitle, episodeId].filter(Boolean).join(" · ");
    return episodeLabel
        ? `${PODCAST_COMMENT_TITLE_PREFIX} ${episodeLabel} — ${excerpt}`
        : `${PODCAST_COMMENT_TITLE_PREFIX} ${excerpt}`;
}

export async function loadPodcastCommentAuthors(userIds: string[]) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const authors = new Map<string, { name: string; avatarUrl: string }>();
    if (uniqueIds.length === 0) return authors;
    const supabase = getSupabaseServerClient();
    const [byId, byUserId] = await Promise.all([
        supabase.from("profiles").select("id,user_id,display_name,name,username,avatar_url").in("id", uniqueIds),
        supabase.from("profiles").select("id,user_id,display_name,name,username,avatar_url").in("user_id", uniqueIds),
    ]);
    for (const row of [...(byId.data || []), ...(byUserId.data || [])] as Record<string, unknown>[]) {
        const id = String(row.user_id || row.id || "");
        const name = String(row.display_name || row.name || row.username || "").trim();
        const avatarUrl = String(row.avatar_url || "").trim();
        if (!id) continue;
        const current = authors.get(id);
        if (!current) {
            authors.set(id, { name: name || "Listener", avatarUrl });
            continue;
        }
        authors.set(id, {
            name: current.name !== "Listener" ? current.name : (name || current.name),
            avatarUrl: current.avatarUrl || avatarUrl,
        });
    }
    return authors;
}

export function mapPodcastCommentRow(
    row: Record<string, unknown>,
    author: { name: string; avatarUrl: string } | undefined,
    viewerUserId = "",
    viewerIsAdmin = false,
) {
    const userId = String(row.user_id || "");
    const isOwn = Boolean(viewerUserId && viewerUserId === userId);
    return {
        id: String(row.id || ""),
        episodeId: String(row.episode_id || ""),
        userId,
        body: String(row.body || ""),
        createdAt: String(row.created_at || ""),
        updatedAt: String(row.updated_at || ""),
        authorName: author?.name || "Listener",
        avatarUrl: author?.avatarUrl || "",
        canDelete: isOwn,
        canReport: Boolean(viewerUserId && !isOwn),
        canModerate: viewerIsAdmin && !isOwn,
    } satisfies PodcastEpisodeComment & { canModerate: boolean };
}

export function isPodcastCommentSetupMissing(error: unknown) {
    const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
    return message.includes("podcast_episode_comments")
        && (message.includes("does not exist") || message.includes("schema cache"));
}
