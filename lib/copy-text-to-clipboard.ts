/**
 * Copy plain text to the clipboard with a secure-context Clipboard API attempt
 * and a textarea/execCommand fallback for LAN HTTP / mobile Safari.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
    const value = String(text || "");
    if (!value) return false;

    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
        // Non-secure contexts (LAN HTTP) and some mobile browsers reject Clipboard API.
    }

    if (typeof document === "undefined") return false;

    const textarea = document.createElement("textarea");
    try {
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.setAttribute("aria-hidden", "true");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        textarea.style.left = "-9999px";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        return document.execCommand("copy");
    } catch {
        return false;
    } finally {
        textarea.remove();
    }
}
