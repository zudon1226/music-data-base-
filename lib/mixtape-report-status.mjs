/** Mixtape community report statuses (mixtape_reports.status). */

export const MIXTAPE_REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"];

export const MIXTAPE_REPORT_STATUS_LABELS = {
    open: "Pending",
    reviewing: "Under review",
    resolved: "Resolved",
    dismissed: "Dismissed",
};

const ALLOWED_TRANSITIONS = {
    open: ["reviewing", "resolved", "dismissed"],
    reviewing: ["open", "resolved", "dismissed"],
    resolved: ["reviewing", "open"],
    dismissed: ["reviewing", "open"],
};

export function isMixtapeReportStatus(value) {
    return MIXTAPE_REPORT_STATUSES.includes(String(value || "").trim());
}

export function canTransitionMixtapeReportStatus(fromStatus, toStatus) {
    const from = String(fromStatus || "").trim();
    const to = String(toStatus || "").trim();
    if (!isMixtapeReportStatus(from) || !isMixtapeReportStatus(to)) return false;
    if (from === to) return true;
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function mixtapeReportQueueBucket(status) {
    const normalized = String(status || "").trim();
    if (normalized === "open") return "pending";
    if (normalized === "reviewing") return "reviewed";
    if (normalized === "resolved") return "resolved";
    if (normalized === "dismissed") return "dismissed";
    return "pending";
}