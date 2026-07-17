"use client";

import { FollowButton } from "@/components/dashboard/follow-button";
import { createDesktopSupabaseAuthClient } from "@/lib/supabase-auth-client";
import { useCallback, useEffect, useState } from "react";

type PublicProfileFollowClientProps = {
    targetUserId: string;
    initialFollowerCount?: number;
};

export function PublicProfileFollowClient({
    targetUserId,
    initialFollowerCount = 0,
}: PublicProfileFollowClientProps) {
    const [viewerUserId, setViewerUserId] = useState("");
    const [followerCount, setFollowerCount] = useState(initialFollowerCount);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const supabase = createDesktopSupabaseAuthClient();
                const { data } = await supabase.auth.getSession();
                if (cancelled) return;
                setViewerUserId(String(data.session?.user?.id || "").trim());
            }
            catch {
                if (!cancelled) setViewerUserId("");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const fetchFn = useCallback(async (path: string, init?: RequestInit & { requireAuth?: boolean }) => {
        const headers = new Headers(init?.headers || {});
        try {
            const supabase = createDesktopSupabaseAuthClient();
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (token) headers.set("Authorization", `Bearer ${token}`);
        }
        catch {
            // unauthenticated public view
        }
        return fetch(path, { ...init, headers, credentials: "same-origin" });
    }, []);

    if (!targetUserId) return null;

    return (
        <FollowButton
            viewerUserId={viewerUserId}
            targetUserId={targetUserId}
            fetchFn={fetchFn}
            initialFollowerCount={followerCount}
            onChanged={(state) => setFollowerCount(state.followerCount)}
        />
    );
}
