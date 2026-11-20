const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ANONYMOUS_PUBLIC_PODCAST_LISTENER_VIEWS = [
    "Podcasts",
    "Podcast Show",
    "Podcast Episode",
] as const;

export type AnonymousPublicPodcastListenerView = (typeof ANONYMOUS_PUBLIC_PODCAST_LISTENER_VIEWS)[number];

export function normalizeAppPathname(pathname: string) {
    return (pathname || "").replace(/\/+$/, "") || "/";
}

export function isPublicPodcastDiscoveryPath(pathname: string) {
    return normalizeAppPathname(pathname) === "/podcast";
}

function parseListenerPodcastPath(pathname: string):
    | { kind: "show"; id: string }
    | { kind: "episode"; id: string }
    | null {
    const clean = normalizeAppPathname(pathname);
    const episodeMatch = clean.match(/^\/podcast\/episode\/([^/]+)$/);
    if (episodeMatch) {
        const id = decodeURIComponent(episodeMatch[1] || "").trim();
        return id && UUID_PATTERN.test(id) ? { kind: "episode", id } : null;
    }
    const showMatch = clean.match(/^\/podcast\/([^/]+)$/);
    if (!showMatch || showMatch[1] === "episode") {
        return null;
    }
    const id = decodeURIComponent(showMatch[1] || "").trim();
    return id && UUID_PATTERN.test(id) ? { kind: "show", id } : null;
}

/** Signed-out visitors may use only discovery, show, and episode podcast URLs. */
export function isAnonymousPublicPodcastListenerPath(pathname: string) {
    if (isPublicPodcastDiscoveryPath(pathname)) {
        return true;
    }
    return parseListenerPodcastPath(pathname) !== null;
}

export function isAnonymousPublicPodcastListenerView(view: string): view is AnonymousPublicPodcastListenerView {
    return (ANONYMOUS_PUBLIC_PODCAST_LISTENER_VIEWS as readonly string[]).includes(view);
}

export const ANONYMOUS_PUBLIC_PODCAST_RETURN_PATH_KEY = "mdb_public_podcast_return_path";
export const ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY = "mdb_public_podcast_login";

export function buildAnonymousPublicPodcastLoginHubUrl() {
    const params = new URLSearchParams();
    params.set(ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY, "1");
    return `/?${params.toString()}`;
}

export function isAnonymousPublicPodcastLoginIntentPath(pathname: string, search = "") {
    if (normalizeAppPathname(pathname) !== "/") {
        return false;
    }
    try {
        const query = search.startsWith("?") ? search.slice(1) : search;
        return new URLSearchParams(query).get(ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY) === "1";
    }
    catch {
        return false;
    }
}

export function storeAnonymousPublicPodcastReturnPath(pathname?: string) {
    if (typeof window === "undefined") {
        return;
    }
    const path = normalizeAppPathname(pathname || window.location.pathname);
    if (!isAnonymousPublicPodcastListenerPath(path)) {
        return;
    }
    try {
        window.sessionStorage.setItem(ANONYMOUS_PUBLIC_PODCAST_RETURN_PATH_KEY, path);
    }
    catch {
        /* ignore */
    }
}

export function peekAnonymousPublicPodcastReturnPath(): string | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const stored = window.sessionStorage.getItem(ANONYMOUS_PUBLIC_PODCAST_RETURN_PATH_KEY);
        if (!stored || !isAnonymousPublicPodcastListenerPath(stored)) {
            return null;
        }
        return stored;
    }
    catch {
        return null;
    }
}

export function consumeAnonymousPublicPodcastReturnPath(): string | null {
    const stored = peekAnonymousPublicPodcastReturnPath();
    if (!stored || typeof window === "undefined") {
        return stored;
    }
    try {
        window.sessionStorage.removeItem(ANONYMOUS_PUBLIC_PODCAST_RETURN_PATH_KEY);
    }
    catch {
        /* ignore */
    }
    return stored;
}

/** Route anonymous podcast listeners into the main auth surface (not podcast-only shell). */
export function redirectAnonymousPublicPodcastListenerToLoginHub() {
    if (typeof window === "undefined") {
        return;
    }
    storeAnonymousPublicPodcastReturnPath();
    window.location.assign(buildAnonymousPublicPodcastLoginHubUrl());
}