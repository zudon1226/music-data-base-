"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MobileDisplayMode } from "../components/mobile-view-toggle";

const MobileDisplayModeContext = createContext<MobileDisplayMode>("list");

export function MobileDisplayModeProvider({
    mode,
    children,
}: {
    mode: MobileDisplayMode;
    children: ReactNode;
}) {
    return (
        <MobileDisplayModeContext.Provider value={mode}>
            {children}
        </MobileDisplayModeContext.Provider>
    );
}

export function useMobileDisplayMode(): MobileDisplayMode {
    return useContext(MobileDisplayModeContext);
}
