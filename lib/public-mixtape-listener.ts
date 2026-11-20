import { parseMixtapePath } from "@/lib/mixtape-routes";
import { normalizeAppPathname } from "@/lib/public-podcast-listener";
import {
    ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY,
    buildAnonymousPublicPodcastLoginHubUrl,
} from "@/lib/public-podcast-listener";

export const ANONYMOUS_PUBLIC_MIXTAPE_LISTENER_VIEWS = [
    "Mixtapes",
    "Mixtape Show",
] as const;

export type AnonymousPublicMixtapeListenerView = (typeof ANONYMOUS_PUBLIC_MIXTAPE_LISTENER_VIEWS)[number];

export function isPublicMixtapeDiscoveryPath(pathname: string) {
    return normalizeAppPathname(pathname) === "/mixtapes";
}

/** Signed-out visitors may browse published mixtape discovery and detail URLs only. */
export function isAnonymousPublicMixtapeListenerPath(pathname: string) {
    if (isPublicMixtapeDiscoveryPath(pathname)) {
        return true;
    }
    const parsed = parseMixtapePath(pathname || "");
    return parsed?.kind === "mixtape";
}

export function isAnonymousPublicMixtapeListenerView(view: string): view is AnonymousPublicMixtapeListenerView {
    return (ANONYMOUS_PUBLIC_MIXTAPE_LISTENER_VIEWS as readonly string[]).includes(view);
}

export const ANONYMOUS_PUBLIC_MIXTAPE_RETURN_PATH_KEY = "mdb_public_mixtape_return_path";

export function storeAnonymousPublicMixtapeReturnPath(pathname?: string) {
    if (typeof window === "undefined") {
        return;
    }
    const path = normalizeAppPathname(pathname || window.location.pathname);
    if (!isAnonymousPublicMixtapeListenerPath(path)) {
        return;
    }
    try {
        window.sessionStorage.setItem(ANONYMOUS_PUBLIC_MIXTAPE_RETURN_PATH_KEY, path);
    }
    catch {
        /* ignore */
    }
}

export function peekAnonymousPublicMixtapeReturnPath(): string | null {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const stored = window.sessionStorage.getItem(ANONYMOUS_PUBLIC_MIXTAPE_RETURN_PATH_KEY);
        if (!stored || !isAnonymousPublicMixtapeListenerPath(stored)) {
            return null;
        }
        return stored;
    }
    catch {
        return null;
    }
}

export function consumeAnonymousPublicMixtapeReturnPath(): string | null {
    const stored = peekAnonymousPublicMixtapeReturnPath();
    if (!stored || typeof window === "undefined") {
        return stored;
    }
    try {
        window.sessionStorage.removeItem(ANONYMOUS_PUBLIC_MIXTAPE_RETURN_PATH_KEY);
    }
    catch {
        /* ignore */
    }
    return stored;
}

export function redirectAnonymousPublicMixtapeListenerToLoginHub() {
    if (typeof window === "undefined") {
        return;
    }
    storeAnonymousPublicMixtapeReturnPath();
    window.location.assign(buildAnonymousPublicPodcastLoginHubUrl());
}

export { ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY };