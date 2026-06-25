"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
    clearDesktopAuthRecoveryGate,
    DESKTOP_AUTH_RECOVERY_EVENT,
    isDesktopAuthRecoveryActive,
    isDesktopSessionReady,
} from "./desktop-auth-recovery-gate";

type DesktopAuthRecoveryListenerOptions = {
    onRecoveryRequired: () => void;
};

/** DESKTOP ONLY — React bridge for the shared desktop auth recovery gate. */
export function useDesktopAuthGate(options: DesktopAuthRecoveryListenerOptions) {
    const { onRecoveryRequired } = options;
    const [gateTick, setGateTick] = useState(0);
    const bumpGateTick = useCallback(() => {
        setGateTick((value) => value + 1);
    }, []);

    useEffect(() => {
        function handleRecoveryRequired() {
            onRecoveryRequired();
            setGateTick((value) => value + 1);
        }
        window.addEventListener(DESKTOP_AUTH_RECOVERY_EVENT, handleRecoveryRequired);
        return () => window.removeEventListener(DESKTOP_AUTH_RECOVERY_EVENT, handleRecoveryRequired);
    }, [onRecoveryRequired]);

    const clearRecoveryAfterLogin = useCallback((session: Session | null | undefined) => {
        clearDesktopAuthRecoveryGate(session);
        setGateTick((value) => value + 1);
    }, []);

    return {
        gateTick,
        bumpGateTick,
        clearRecoveryAfterLogin,
        isRecoveryActive: isDesktopAuthRecoveryActive(),
        isSessionReady: (session: Session | null | undefined) => isDesktopSessionReady(session),
    };
}

export { isDesktopAuthRecoveryActive, isDesktopSessionReady };
