export function detectSupportDeviceType() {
    if (typeof navigator === "undefined") return "unknown";
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
    if (/Android/i.test(ua)) return "android";
    if (/Mobile/i.test(ua)) return "mobile";
    return "desktop";
}

export function detectSupportBrowser() {
    if (typeof navigator === "undefined") return "";
    return (navigator.userAgent || "").slice(0, 480);
}

export function detectSupportPagePath() {
    if (typeof window === "undefined") return "";
    return `${window.location.pathname}${window.location.search}`.slice(0, 500);
}
