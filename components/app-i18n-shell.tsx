"use client";

import { useEffect, useState, type ReactNode } from "react";
import { I18nProvider } from "../lib/i18n/provider";
import { I18N_GLOBAL_STYLES } from "../lib/i18n/i18n-styles";
import { useDesktopAuthState } from "../lib/desktop-auth-state";

type AppI18nShellProps = {
    children: ReactNode;
};

export function AppI18nShell({ children }: AppI18nShellProps) {
    const { accountUserId, authSession } = useDesktopAuthState();
    const [profileLocale, setProfileLocale] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function loadProfileLocale() {
            if (!accountUserId || !authSession?.access_token) {
                setProfileLocale(null);
                return;
            }
            try {
                const response = await fetch(`/api/user-profile?userId=${encodeURIComponent(accountUserId)}`, {
                    headers: { Authorization: `Bearer ${authSession.access_token}` },
                    cache: "no-store",
                });
                const json = await response.json().catch(() => ({}));
                if (!cancelled) {
                    setProfileLocale(typeof json.preferredLanguage === "string" ? json.preferredLanguage : null);
                }
            }
            catch {
                if (!cancelled) setProfileLocale(null);
            }
        }
        void loadProfileLocale();
        return () => {
            cancelled = true;
        };
    }, [accountUserId, authSession?.access_token]);

    return (
        <I18nProvider
            userId={accountUserId}
            accessToken={authSession?.access_token || ""}
            profileLocale={profileLocale}
        >
            <style dangerouslySetInnerHTML={{ __html: I18N_GLOBAL_STYLES }}/>
            {children}
        </I18nProvider>
    );
}
