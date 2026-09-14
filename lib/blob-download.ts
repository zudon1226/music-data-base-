import { Capacitor } from "@capacitor/core";

/**
 * Save a Blob as a download. Uses anchor download on web; on Android Capacitor WebView
 * also opens the blob URL so the system download/viewer can handle MP3 ringtone files.
 */
export function downloadBlobAsFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
    }
    URL.revokeObjectURL(url);
}
