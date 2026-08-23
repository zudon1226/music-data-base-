const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function podcastShowPath(showId: string) {
    return `/podcast/${encodeURIComponent(showId)}`;
}

export function podcastEpisodePath(episodeId: string) {
    return `/podcast/episode/${encodeURIComponent(episodeId)}`;
}

export function isPodcastPath(pathname: string) {
    return pathname === "/podcast" || pathname.startsWith("/podcast/");
}

export function parsePodcastPath(pathname: string):
    | { kind: "show"; id: string }
    | { kind: "episode"; id: string }
    | null {
    const clean = pathname.replace(/\/+$/, "") || "/";
    const episodeMatch = clean.match(/^\/podcast\/episode\/([^/]+)$/);
    if (episodeMatch) {
        const id = decodeURIComponent(episodeMatch[1] || "").trim();
        return id && UUID_PATTERN.test(id) ? { kind: "episode", id } : null;
    }
    const showMatch = clean.match(/^\/podcast\/([^/]+)$/);
    if (!showMatch || showMatch[1] === "episode") return null;
    const id = decodeURIComponent(showMatch[1] || "").trim();
    return id && UUID_PATTERN.test(id) ? { kind: "show", id } : null;
}

export function podcastShareUrl(kind: "show" | "episode", id: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${kind === "show" ? podcastShowPath(id) : podcastEpisodePath(id)}`;
}
