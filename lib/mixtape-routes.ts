const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function mixtapePath(mixtapeId: string) {
    return `/mixtape/${encodeURIComponent(mixtapeId)}`;
}

export function mixtapeTrackPath(trackId: string) {
    return `/mixtape/track/${encodeURIComponent(trackId)}`;
}

export function isMixtapePath(pathname: string) {
    return pathname === "/mixtapes" || pathname.startsWith("/mixtape/");
}

export function parseMixtapePath(pathname: string):
    | { kind: "mixtape"; id: string }
    | { kind: "track"; id: string }
    | null {
    const clean = pathname.replace(/\/+$/, "") || "/";
    const trackMatch = clean.match(/^\/mixtape\/track\/([^/]+)$/);
    if (trackMatch) {
        const id = decodeURIComponent(trackMatch[1] || "").trim();
        return id && UUID_PATTERN.test(id) ? { kind: "track", id } : null;
    }
    const mixtapeMatch = clean.match(/^\/mixtape\/([^/]+)$/);
    if (!mixtapeMatch || mixtapeMatch[1] === "track") return null;
    const id = decodeURIComponent(mixtapeMatch[1] || "").trim();
    return id && UUID_PATTERN.test(id) ? { kind: "mixtape", id } : null;
}

export function mixtapeShareUrl(kind: "mixtape" | "track", id: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${kind === "mixtape" ? mixtapePath(id) : mixtapeTrackPath(id)}`;
}