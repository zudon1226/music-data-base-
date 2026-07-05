/** DESKTOP ONLY — live-session guard for protected desktop write actions. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
    resolveLiveDesktopProtectedActionCredentials,
    type DesktopProtectedActionPipelineConfig,
} from "./desktop-protected-action-pipeline";

export type DesktopProtectedActionAuthConfig = DesktopProtectedActionPipelineConfig & {
    /** UI/read hints only — never used to block protected writes. */
    readUiUserIdHint?: () => string;
};

/** @deprecated — sync sources are not used for write authorization. */
export type DesktopProtectedActionAuthSources = {
    readAuthSession: () => Session | null;
    readAccountUserId: () => string;
    readUser: () => import("@supabase/supabase-js").User | null;
    readActiveUser: () => import("@supabase/supabase-js").User | null;
};

export type DesktopProtectedActionAuthDecision =
    | { allowed: true; userId: string }
    | { allowed: false; reason: "no-session" | "user-id-pending" };

export type DesktopProtectedActionAuthGuard = {
    /** Resolve userId from live getSession()/refresh — use for all protected writes. */
    requireLiveUserId: (loginMessage: string, onBlocked: (message: string) => void) => Promise<string>;
    resolveLiveUserId: () => Promise<string>;
    hasLiveAccess: () => Promise<boolean>;
    /** @deprecated Sync hint only — never gate protected writes. */
    evaluate: () => DesktopProtectedActionAuthDecision;
    /** @deprecated Sync hint only — never gate protected writes. */
    hasAccess: () => boolean;
    /** @deprecated Sync hint only — never gate protected writes. */
    getUserId: () => string;
    /** @deprecated Use requireLiveUserId for protected writes. */
    requireUserId: (loginMessage: string, onBlocked: (message: string) => void) => string;
};

export function createDesktopProtectedActionAuthGuard(
    config: DesktopProtectedActionAuthConfig,
): DesktopProtectedActionAuthGuard {
    return {
        async requireLiveUserId(loginMessage, onBlocked) {
            const credentials = await resolveLiveDesktopProtectedActionCredentials(config, {
                debugLabel: "guard-requireLiveUserId",
            });
            if (credentials?.userId) {
                return credentials.userId;
            }
            onBlocked(loginMessage);
            return "";
        },

        async resolveLiveUserId() {
            const credentials = await resolveLiveDesktopProtectedActionCredentials(config, {
                debugLabel: "guard-resolveLiveUserId",
            });
            return credentials?.userId ?? "";
        },

        async hasLiveAccess() {
            const credentials = await resolveLiveDesktopProtectedActionCredentials(config, {
                debugLabel: "guard-hasLiveAccess",
            });
            return Boolean(credentials);
        },

        evaluate() {
            const userId = String(config.readUiUserIdHint?.() || "").trim();
            if (userId) {
                return { allowed: true, userId };
            }
            return { allowed: false, reason: "no-session" };
        },

        hasAccess() {
            return Boolean(String(config.readUiUserIdHint?.() || "").trim());
        },

        getUserId() {
            return String(config.readUiUserIdHint?.() || "").trim();
        },

        requireUserId(_loginMessage, _onBlocked) {
            return String(config.readUiUserIdHint?.() || "").trim();
        },
    };
}

/** @deprecated — sync evaluation removed; always defers to live session resolution. */
export function evaluateDesktopProtectedActionAuth(
    _sources: DesktopProtectedActionAuthSources,
): DesktopProtectedActionAuthDecision {
    return { allowed: false, reason: "no-session" };
}

/** @deprecated */
export function hasDesktopProtectedActionAccess(_sources: DesktopProtectedActionAuthSources) {
    return false;
}

/** @deprecated */
export function resolveDesktopProtectedActionUserId(_sources: DesktopProtectedActionAuthSources) {
    return "";
}

/** @deprecated */
export function buildDesktopProtectedActionIdentity(
    sources: DesktopProtectedActionAuthSources,
) {
    return {
        accountUserId: sources.readAccountUserId(),
        user: sources.readUser(),
        activeUser: sources.readActiveUser(),
        authSession: sources.readAuthSession(),
    };
}

export type { SupabaseClient };
