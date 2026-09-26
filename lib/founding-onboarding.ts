
export const FOUNDING_ROLES = ["founding_artist", "founding_producer"] as const;
export type FoundingRole = (typeof FOUNDING_ROLES)[number];

export const FOUNDING_APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type FoundingApprovalStatus = (typeof FOUNDING_APPROVAL_STATUSES)[number];

export const FOUNDING_INVITE_STATUSES = ["active", "used", "expired", "revoked"] as const;
export type FoundingInviteStatus = (typeof FOUNDING_INVITE_STATUSES)[number];

export type FoundingMemberRecord = {
    user_id: string;
    founding_role: FoundingRole;
    approval_status: FoundingApprovalStatus;
    invite_id: string | null;
    display_name: string | null;
    social_link: string | null;
    profile_image_url: string | null;
    badge_label: string;
    joined_at: string;
    approved_at: string | null;
    approved_by: string | null;
    rejected_at: string | null;
    rejected_by: string | null;
    updated_at: string;
};

export type FoundingInviteRecord = {
    id: string;
    invite_code: string;
    intended_role: FoundingRole;
    status: FoundingInviteStatus;
    created_by: string | null;
    redeemed_by: string | null;
    redeemed_at: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
};

export function parseTruthyFlag(value: string | undefined) {
    const normalized = (value || "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function isFoundingBetaLocked() {
    return parseTruthyFlag(process.env.NEXT_PUBLIC_FOUNDING_BETA_LOCKED);
}

export function normalizeFoundingRole(value: unknown): FoundingRole | null {
    const normalized = String(value || "").trim().toLowerCase();
    return FOUNDING_ROLES.includes(normalized as FoundingRole) ? normalized as FoundingRole : null;
}

export function normalizeInviteCode(value: unknown) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function buildFoundingInviteLink(siteUrl: string, inviteCode: string) {
    const base = siteUrl.replace(/\/+$/, "");
    return `${base}/?invite=${encodeURIComponent(inviteCode)}`;
}

export function foundingRoleLabel(role: FoundingRole) {
    return role === "founding_producer" ? "Founding Producer" : "Founding Artist";
}

export function foundingRequestLabel(role: FoundingRole) {
    return role === "founding_producer" ? "Producer Request" : "Artist Request";
}

export function ordinaryCreatorRoleLabel(role: FoundingRole) {
    return role === "founding_producer" ? "Producer" : "Artist";
}

export function hasExplicitFoundingDesignation(
    accountType?: unknown,
    accountRoles?: Iterable<string> | null,
) {
    const tokens = new Set<string>();
    const primary = String(accountType || "").trim().toLowerCase();
    if (primary) tokens.add(primary);
    for (const role of accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) tokens.add(clean);
    }
    return tokens.has("founding_artist") || tokens.has("founding_producer");
}

export function foundingStatusRoleLabel(
    role: FoundingRole,
    approvalStatus: FoundingApprovalStatus | string | null | undefined,
    options?: { explicitFounding?: boolean },
) {
    if (approvalStatus === "approved") {
        return options?.explicitFounding ? foundingRoleLabel(role) : ordinaryCreatorRoleLabel(role);
    }
    return foundingRequestLabel(role);
}

export function foundingRoleDashboard(role: FoundingRole) {
    return role === "founding_producer" ? "Producer Dashboard" : "Artist Dashboard";
}

export function mapFoundingRoleToAccountType(role: FoundingRole) {
    return role;
}

export function isInviteExpired(record: Pick<FoundingInviteRecord, "expires_at" | "status">, now = Date.now()) {
    if (record.status === "expired") return true;
    if (!record.expires_at) return false;
    return new Date(record.expires_at).getTime() <= now;
}

export function resolveInviteStatus(record: FoundingInviteRecord, now = Date.now()): FoundingInviteStatus {
    if (record.status === "used" || record.status === "revoked") return record.status;
    if (isInviteExpired(record, now)) return "expired";
    return record.status === "active" ? "active" : record.status;
}

export const FOUNDING_INVITE_REQUIRED_MESSAGE =
    "Founding beta signup requires a valid invite code from Music Data Base.";

export const FOUNDING_PENDING_MESSAGE =
    "Your founding member account is pending owner approval.";

export const FOUNDING_REJECTED_MESSAGE =
    "Your founding member application was not approved.";

export const LISTENER_LAUNCH_WAITLIST_TITLE =
    "You're registered for launch notifications";

export const LISTENER_LAUNCH_WAITLIST_MESSAGE =
    "Thanks for signing up. We'll email you when Music Data Base launches. This registration does not include app access, Upload, Artist Studio, or Producer Studio.";

export const FOUNDING_ROLE_LOCKED_MESSAGE =
    "Your founding role is assigned by invite and cannot be changed.";
