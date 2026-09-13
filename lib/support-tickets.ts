/**
 * Public beta support ticket types and safe field handling.
 */

export const SUPPORT_TICKET_CATEGORIES = [
    "upload",
    "playback",
    "account",
    "podcast",
    "ringtone",
    "billing",
    "navigation",
    "bug",
    "suggestion",
    "other",
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_STATUSES = [
    "new",
    "reviewing",
    "need_more_info",
    "fixed",
    "closed",
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_SEVERITIES = ["low", "medium", "high", "urgent"] as const;

export type SupportTicketSeverity = (typeof SUPPORT_TICKET_SEVERITIES)[number];

/** Stored on tickets from the user's account role at submit time (Listener / Artist / Producer). */
export const SUPPORT_TICKET_ACCOUNT_ROLES = ["Listener", "Artist", "Producer"] as const;

export type SupportTicketAccountRole = (typeof SUPPORT_TICKET_ACCOUNT_ROLES)[number];

/** Maps admin role filter values to the canonical account_type stored on tickets. */
export function resolveSupportAccountTypeFilter(value: unknown): SupportTicketAccountRole | null {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized || normalized === "all") {
        return null;
    }
    if (normalized === "listener") return "Listener";
    if (normalized === "artist") return "Artist";
    if (normalized === "producer") return "Producer";
    const exact = SUPPORT_TICKET_ACCOUNT_ROLES.find((role) => role.toLowerCase() === normalized);
    return exact || null;
}

const SECRET_PATTERNS = [
    /sk_live_[a-z0-9]+/gi,
    /sk_test_[a-z0-9]+/gi,
    /rk_live_[a-z0-9]+/gi,
    /whsec_[a-z0-9]+/gi,
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    /Bearer\s+[a-zA-Z0-9._-]+/gi,
    /SUPABASE_SERVICE_ROLE_KEY\s*=/gi,
    /STRIPE_SECRET_KEY\s*=/gi,
    /DATABASE_URL\s*=/gi,
    /password\s*[:=]/gi,
    /authorization\s*[:=]/gi,
    /cookie\s*[:=]/gi,
];

export function redactSupportText(value: unknown, maxLen = 8000) {
    let text = String(value || "").trim();
    for (const pattern of SECRET_PATTERNS) {
        text = text.replace(pattern, "[redacted]");
    }
    if (text.length > maxLen) {
        return `${text.slice(0, maxLen)}…`;
    }
    return text;
}

export function normalizeSupportCategory(value: unknown): SupportTicketCategory | null {
    const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
    const map: Record<string, SupportTicketCategory> = {
        upload: "upload",
        upload_problem: "upload",
        playback: "playback",
        playback_problem: "playback",
        account: "account",
        login: "account",
        login_account: "account",
        podcast: "podcast",
        ringtone: "ringtone",
        billing: "billing",
        subscription: "billing",
        subscription_billing: "billing",
        navigation: "navigation",
        navigation_layout: "navigation",
        layout: "navigation",
        bug: "bug",
        general_bug: "bug",
        suggestion: "suggestion",
        feedback: "suggestion",
        suggestion_feedback: "suggestion",
        other: "other",
        general: "other",
        marketplace: "billing",
        trust: "other",
    };
    return map[normalized] || null;
}

export function normalizeSupportStatus(value: unknown): SupportTicketStatus | null {
    const normalized = String(value || "").trim().toLowerCase();
    return (SUPPORT_TICKET_STATUSES as readonly string[]).includes(normalized)
        ? normalized as SupportTicketStatus
        : null;
}

export function normalizeSupportSeverity(value: unknown): SupportTicketSeverity {
    const normalized = String(value || "medium").trim().toLowerCase();
    return (SUPPORT_TICKET_SEVERITIES as readonly string[]).includes(normalized)
        ? normalized as SupportTicketSeverity
        : "medium";
}

export type SupportTicketDiagnosticsInput = {
    pagePath?: string;
    deviceType?: string;
    browser?: string;
    appErrorCode?: string;
    requestId?: string;
    uploadType?: string;
    fileType?: string;
    fileSize?: number;
    uploadStage?: string;
};

export function sanitizeDiagnostics(input: SupportTicketDiagnosticsInput): SupportTicketDiagnosticsInput {
    return {
        pagePath: redactSupportText(input.pagePath, 500),
        deviceType: redactSupportText(input.deviceType, 120),
        browser: redactSupportText(input.browser, 500),
        appErrorCode: redactSupportText(input.appErrorCode, 120),
        requestId: redactSupportText(input.requestId, 120),
        uploadType: redactSupportText(input.uploadType, 80),
        fileType: redactSupportText(input.fileType, 120),
        fileSize: Number.isFinite(input.fileSize) && (input.fileSize as number) >= 0
            ? Math.min(Math.floor(input.fileSize as number), 5_000_000_000)
            : undefined,
        uploadStage: redactSupportText(input.uploadStage, 120),
    };
}

export type SupportTicketUserRow = {
    id: string;
    ticketNumber: string;
    userId: string;
    accountType: string | null;
    category: string;
    subject: string;
    description: string;
    severity: string;
    status: string;
    pagePath: string | null;
    deviceType: string | null;
    browser: string | null;
    appErrorCode: string | null;
    requestId: string | null;
    uploadType: string | null;
    fileType: string | null;
    fileSize: number | null;
    uploadStage: string | null;
    screenshotPath: string | null;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
};

export type SupportTicketAdminRow = SupportTicketUserRow & {
    adminNotes: string | null;
    userName: string;
};

export function mapTicketRowForUser(row: Record<string, unknown>): SupportTicketUserRow {
    return {
        id: String(row.id || ""),
        ticketNumber: String(row.ticket_number || ""),
        userId: String(row.user_id || ""),
        accountType: row.account_type ? String(row.account_type) : null,
        category: String(row.category || "other"),
        subject: String(row.subject || row.title || ""),
        description: String(row.description || row.body || ""),
        severity: String(row.severity || row.priority || "medium"),
        status: String(row.status || "new"),
        pagePath: row.page_path ? String(row.page_path) : null,
        deviceType: row.device_type ? String(row.device_type) : null,
        browser: row.browser ? String(row.browser) : null,
        appErrorCode: row.app_error_code ? String(row.app_error_code) : null,
        requestId: row.request_id ? String(row.request_id) : null,
        uploadType: row.upload_type ? String(row.upload_type) : null,
        fileType: row.file_type ? String(row.file_type) : null,
        fileSize: row.file_size != null ? Number(row.file_size) : null,
        uploadStage: row.upload_stage ? String(row.upload_stage) : null,
        screenshotPath: row.screenshot_path ? String(row.screenshot_path) : null,
        createdAt: String(row.created_at || ""),
        updatedAt: String(row.updated_at || ""),
        resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    };
}

export function mapTicketRowForAdmin(row: Record<string, unknown>): SupportTicketAdminRow {
    return {
        ...mapTicketRowForUser(row),
        adminNotes: row.admin_notes ? String(row.admin_notes) : null,
        userName: String(row.user_name || ""),
    };
}

export const SUPPORT_TICKET_USER_SELECT =
    "id,ticket_number,user_id,account_type,category,subject,description,severity,status,page_path,device_type,browser,app_error_code,request_id,upload_type,file_type,file_size,upload_stage,screenshot_path,created_at,updated_at,resolved_at,title,body,priority";

export const SUPPORT_TICKET_ADMIN_SELECT = `${SUPPORT_TICKET_USER_SELECT},admin_notes,user_name`;
