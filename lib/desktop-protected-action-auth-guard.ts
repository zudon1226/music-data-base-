/** DESKTOP ONLY — single authentication guard for all protected desktop actions. */

import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import {
    hasUsableDesktopProtectedActionSession,
    resolveDesktopActionUserId,
    type DesktopActionIdentityInput,
} from "./desktop-action-runtime";

export type DesktopProtectedActionAuthSources = {
    readAuthSession: () => Session | null;
    readAccountUserId: () => string;
    readUser: () => SupabaseUser | null;
    readActiveUser: () => SupabaseUser | null;
};

export type DesktopProtectedActionAuthDecision =
    | { allowed: true; userId: string }
    | { allowed: false; reason: "no-session" | "user-id-pending" };

export function buildDesktopProtectedActionIdentity(
    sources: DesktopProtectedActionAuthSources,
): DesktopActionIdentityInput {
    return {
        accountUserId: sources.readAccountUserId(),
        user: sources.readUser(),
        activeUser: sources.readActiveUser(),
        authSession: sources.readAuthSession(),
    };
}

export function evaluateDesktopProtectedActionAuth(
    sources: DesktopProtectedActionAuthSources,
): DesktopProtectedActionAuthDecision {
    const identity = buildDesktopProtectedActionIdentity(sources);
    const userId = resolveDesktopActionUserId(identity);
    if (userId) {
        return { allowed: true, userId };
    }
    if (!hasUsableDesktopProtectedActionSession(identity.authSession)) {
        return { allowed: false, reason: "no-session" };
    }
    return { allowed: false, reason: "user-id-pending" };
}

export function hasDesktopProtectedActionAccess(sources: DesktopProtectedActionAuthSources) {
    return evaluateDesktopProtectedActionAuth(sources).allowed;
}

export function resolveDesktopProtectedActionUserId(sources: DesktopProtectedActionAuthSources) {
    const decision = evaluateDesktopProtectedActionAuth(sources);
    return decision.allowed ? decision.userId : "";
}

export type DesktopProtectedActionAuthGuard = {
    evaluate: () => DesktopProtectedActionAuthDecision;
    hasAccess: () => boolean;
    getUserId: () => string;
    requireUserId: (loginMessage: string, onBlocked: (message: string) => void) => string;
};

export function createDesktopProtectedActionAuthGuard(
    sources: DesktopProtectedActionAuthSources,
): DesktopProtectedActionAuthGuard {
    return {
        evaluate: () => evaluateDesktopProtectedActionAuth(sources),
        hasAccess: () => hasDesktopProtectedActionAccess(sources),
        getUserId: () => resolveDesktopProtectedActionUserId(sources),
        requireUserId: (loginMessage, onBlocked) => {
            const decision = evaluateDesktopProtectedActionAuth(sources);
            if (decision.allowed) {
                return decision.userId;
            }
            if (decision.reason === "user-id-pending") {
                onBlocked("Your session is still loading. Try again in a moment.");
                return "";
            }
            onBlocked(loginMessage);
            return "";
        },
    };
}
