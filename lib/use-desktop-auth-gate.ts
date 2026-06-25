"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
    clearDesktopAuthRecoveryGate,
    DESKTOP_AUTH_RECOVERY_EVENT,
    isDesktopAuthRecoveryActive,
    isDesktopSessionReady,
} from "./desktop-auth-recovery-gate";

type DesktopAuthGateOptions = {
    onRecoveryRequired: () => void;
};

/** DESKTOP ONLY — auth initialization gate and recovery bridge for the desktop shell. */
export function useDesktopAuthGate(options: DesktopAuthGateOptions) {
    const { onRecoveryRequired } = options;
    const [authInitialized, setAuthInitialized] = useState(false);
    const [gateTick, setGateTick] = useState(0);

    const bumpGateTick = useCallback(() => {
        setGateTick((value) => value + 1);
    }, []);

    const markAuthInitialized = useCallback(() => {
        setAuthInitialized(true);
    }, []);

    const clearRecoveryAfterLogin = useCallback((session: Session | null | undefined) => {
        clearDesktopAuthRecoveryGate();
        void session;
        bumpGateTick();
    }, [bumpGateTick]);

    useEffect(() => {
        function handleRecoveryRequired() {
            onRecoveryRequired();
            bumpGateTick();
        }
        window.addEventListener(DESKTOP_AUTH_RECOVERY_EVENT, handleRecoveryRequired);
        return () => window.removeEventListener(DESKTOP_AUTH_RECOVERY_EVENT, handleRecoveryRequired);
    }, [bumpGateTick, onRecoveryRequired]);

    return {
        authInitialized,
        gateTick,
        bumpGateTick,
        markAuthInitialized,
        clearRecoveryAfterLogin,
        isRecoveryActive: isDesktopAuthRecoveryActive(),
        isSessionReady: (session: Session | null | undefined) => isDesktopSessionReady(session),
    };
}

export { isDesktopAuthRecoveryActive, isDesktopSessionReady };
