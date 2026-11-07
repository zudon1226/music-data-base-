"use client";

import { useEffect } from "react";

function isCapacitorNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Registers the root service worker for PWA install (Edge / Microsoft Store).
 * Skipped inside Capacitor iOS/Android shells, which load the same origin in a WebView.
 */
export function RegisterPwaServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (isCapacitorNativeShell()) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch {
        // Installability degrades without SW; app remains usable.
      }
    };

    void register();
  }, []);

  return null;
}
