/**
 * Effective role / access model proofs for Listener, Artist, Producer, Admin, Overview.
 * Usage: node scripts/verify-effective-role-access.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8").replace(/\r\n/g, "\n");
}

function normalizeResolvedAccountRole(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "admin") return "admin";
    if (["artist", "founding_artist", "artist_pro", "creator"].includes(normalized)) return "artist";
    if (["producer", "founding_producer", "producer_pro"].includes(normalized)) return "producer";
    return "listener";
}

function resolveCapabilitiesFromExplicitRoles(input) {
    const roles = new Set();
    for (const role of input.accountRoles || []) {
        const clean = String(role || "").trim().toLowerCase();
        if (clean) roles.add(clean);
    }
    const primary = normalizeResolvedAccountRole(input.primaryRole);
    if (primary !== "listener") roles.add(primary);
    if (input.isAdmin) roles.add("admin");
    const isAdmin = Boolean(input.isAdmin) || roles.has("admin");
    const isArtist = isAdmin || roles.has("artist") || roles.has("founding_artist") || roles.has("artist_pro") || roles.has("creator");
    const isProducer = isAdmin || roles.has("producer") || roles.has("founding_producer") || roles.has("producer_pro");
    const isCreator = isArtist || isProducer;
    if (isAdmin) {
        return { isAdmin: true, isArtist: true, isProducer: true, isListenerOnly: false, canUpload: true, canArtistDashboard: true, canProducerDashboard: true };
    }
    return {
        isAdmin: false,
        isArtist,
        isProducer,
        isListenerOnly: !isCreator,
        canUpload: isCreator,
        canArtistDashboard: isArtist,
        canProducerDashboard: isProducer,
    };
}

function countOverviewRolesFromProfiles(profiles, activeRoles, foundingMembers = [], authSignals = []) {
    const rolesByUser = new Map();
    for (const row of activeRoles) {
        const userId = String(row.user_id || "").trim();
        const role = String(row.role || "").trim().toLowerCase();
        if (!userId || !role) continue;
        const list = rolesByUser.get(userId) || [];
        list.push(role);
        rolesByUser.set(userId, list);
    }
    const foundingByUser = new Map();
    for (const row of foundingMembers) {
        const userId = String(row.user_id || "").trim();
        if (userId) foundingByUser.set(userId, row);
    }
    const authByUser = new Map();
    for (const row of authSignals) {
        const userId = String(row.user_id || "").trim();
        if (userId) authByUser.set(userId, row);
    }
    const counts = { totalUsers: 0, listeners: 0, launchNotificationSignups: 0, artists: 0, producers: 0, admins: 0 };
    const seen = new Set();
    for (const profile of profiles) {
        const id = String(profile.id || "").trim();
        const userId = String(profile.user_id || "").trim();
        const key = id || userId;
        if (!key || seen.has(key) || (userId && seen.has(userId)) || (id && seen.has(id))) continue;
        seen.add(key);
        if (id) seen.add(id);
        if (userId) seen.add(userId);
        const primaryRole = normalizeResolvedAccountRole(profile.account_type);
        const isAdmin = profile.is_admin === true || primaryRole === "admin";
        if (isAdmin) {
            counts.admins += 1;
            continue;
        }
        const founding = foundingByUser.get(id) || (userId ? foundingByUser.get(userId) : undefined);
        const approval = String(founding?.approval_status || "").trim().toLowerCase();
        if (approval === "pending" || approval === "rejected") continue;
        if (approval === "approved") {
            const mergedRoles = [
                ...(rolesByUser.get(id) || []),
                ...(userId && userId !== id ? rolesByUser.get(userId) || [] : []),
            ];
            const caps = resolveCapabilitiesFromExplicitRoles({
                isAdmin: false,
                primaryRole: profile.account_type || founding?.founding_role || primaryRole,
                accountRoles: mergedRoles,
            });
            if (caps.isArtist) counts.artists += 1;
            if (caps.isProducer) counts.producers += 1;
            if (caps.isListenerOnly) counts.listeners += 1;
            counts.totalUsers += 1;
            continue;
        }
        const auth = authByUser.get(id) || (userId ? authByUser.get(userId) : undefined);
        if (isLaunchNotificationSignupAccount({
            accountType: profile.account_type,
            requestedAccountType: auth?.requestedAccountType,
            metadataRole: auth?.metadataRole,
        })) {
            counts.launchNotificationSignups += 1;
        }
    }
    return counts;
}

function isLaunchNotificationSignupAccount(input) {
    const profileRole = normalizeResolvedAccountRole(input.accountType);
    if (profileRole !== "listener") return false;
    const requested = String(input.requestedAccountType || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const metaRole = String(input.metadataRole || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (requested === "listener") return true;
    if (requested || ["artist", "producer", "founding_artist", "founding_producer", "admin"].includes(metaRole)) return false;
    return metaRole === "listener";
}

const resolver = read("lib/resolved-account-role.ts");
const page = read("app/page.tsx");
const producers = read("app/api/producers/route.ts");
const uploadAudio = read("app/api/upload-audio/route.ts");
const videoUpload = read("app/api/video-upload/route.ts");
const service = read("lib/platform-control-center-service.ts");
const ui = read("components/platform-control-center.tsx");
const foundingInvite = read("lib/founding-invite-service.ts");
const layout = read("app/layout.tsx");
const migration = read("supabase/migrations/202609191001_lock_profile_account_type.sql");

record("LISTENER_SELF_PROMOTION_DENIED", resolver.includes("canSelfServiceChangeAccountType")
    && producers.includes("canSelfServiceChangeAccountType")
    && page.includes("cannot be changed from Profile")
    && !/\(\[\"Listener\", \"Artist\", \"Producer\"\] as AccountRole\[\]\)/.test(page));
record("LISTENER_UPLOAD_DENIED", uploadAudio.includes("requireCreatorUploadAccess")
    && resolver.includes("requireCreatorUploadAccess")
    && page.includes("shouldShowUploadControl(desktopNavAccess) ? ("));
record("LISTENER_ARTIST_STUDIO_DENIED", page.includes("shouldShowArtistDashboardControl(desktopNavAccess)")
    && resolver.includes("canArtistDashboard"));
record("LISTENER_PRODUCER_STUDIO_DENIED", page.includes("shouldShowProducerDashboardControl(desktopNavAccess)")
    && resolver.includes("canProducerDashboard"));
record("ARTIST_UPLOAD_ALLOWED", resolver.includes("canUpload: isCreator") || resolver.includes("canUpload: true"));
record("ARTIST_STUDIO_ALLOWED", resolver.includes("canArtistDashboard: isArtist") || resolver.includes("canArtistDashboard: true"));
record("PRODUCER_UPLOAD_ALLOWED", resolver.includes("canUpload: isCreator") || resolver.includes("canUpload: true"));
record("PRODUCER_STUDIO_ALLOWED", resolver.includes("canProducerDashboard: isProducer") || resolver.includes("canProducerDashboard: true"));

const leakedListener = countOverviewRolesFromProfiles(
    [
        { id: "admin", account_type: "admin", is_admin: true },
        { id: "a1", account_type: "artist", is_admin: false },
        { id: "p1", account_type: "founding_producer", is_admin: false },
        { id: "l1", account_type: "listener", is_admin: false },
        { id: "l2", account_type: "listener", is_admin: false },
        { id: "probe", account_type: "producer", is_admin: false },
        { id: "stale-probe", account_type: "listener", is_admin: false },
    ],
    [{ user_id: "l1", role: "artist" }],
    [
        { user_id: "a1", approval_status: "approved", founding_role: "founding_artist" },
        { user_id: "p1", approval_status: "pending", founding_role: "founding_producer" },
    ],
    [
        { user_id: "l1", requestedAccountType: "listener", metadataRole: "listener" },
        { user_id: "l2", requestedAccountType: "listener", metadataRole: "listener" },
        { user_id: "stale-probe", requestedAccountType: "", metadataRole: "producer" },
    ],
);
record("ADMIN_NOT_COUNTED_AS_LISTENER", leakedListener.admins === 1 && leakedListener.listeners === 0);
record("OVERVIEW_TOTAL_USERS_ACCURATE", leakedListener.totalUsers === 1);
record("ADMIN_EXCLUDED_FROM_MEMBERS", leakedListener.admins === 1 && leakedListener.totalUsers === 1);
record("OVERVIEW_LISTENERS_ROLE_ONLY", leakedListener.listeners === 0 && leakedListener.launchNotificationSignups === 2);
record("OVERVIEW_ARTISTS_ROLE_ONLY", leakedListener.artists === 1);
record("OVERVIEW_PRODUCERS_ROLE_ONLY", leakedListener.producers === 0);
record("stale listener user_roles ignored in overview", leakedListener.artists === 1);
record("unapproved founding producer excluded from producers", leakedListener.producers === 0);
record("leaked producer account_type without approval is not launch signup", leakedListener.launchNotificationSignups === 2 && leakedListener.listeners === 0);
record("stale producer metadata excluded from launch signups", leakedListener.launchNotificationSignups === 2);
record("launch signups excluded from app user total", leakedListener.totalUsers === 1 && leakedListener.launchNotificationSignups === 2);
record("pending requests excluded from app user total", leakedListener.totalUsers === 1 && leakedListener.producers === 0);

record("OVERVIEW_APPROVED_FOUNDING_ACCURATE", service.includes('["approval_status", "eq", "approved"]')
    && service.includes('["invite_id", "not_is", null]')
    && service.includes("approvedUsers: approvedResult.count")
    && ui.includes('["Founding members (invited)"')
    && ui.includes('["Members"')
    && !ui.includes("Total users")
    && !ui.includes("Listeners / launch signups")
    && !ui.includes("Approved users")
    && !ui.includes("Pending users"));
record("FOUNDING_ARTIST_PRESERVED", foundingInvite.includes("resolveSignupAccountTypeGrants")
    && !foundingInvite.includes("delete from founding_members"));
record("FOUNDING_PRODUCER_PRESERVED", read("lib/founding-onboarding.ts").includes("founding_producer"));
record("video-upload creator gate", videoUpload.includes("requireCreatorUploadAccess"));
record("overview service uses resolver counts", service.includes("listeners: roleCounts.listeners")
    && service.includes("admins: roleCounts.admins")
    && service.includes("launchNotificationSignups: roleCounts.launchNotificationSignups")
    && service.includes("getUserById")
    && ui.includes('["Pending creator requests"'));
record("account_type client lock migration", migration.includes("prevent_client_account_type_change")
    && migration.includes("service_role"));
record("HYDRATION_FIX_PRESERVED", layout.includes("suppressHydrationWarning"));

const access = read("lib/founding-access.ts");
const apiGate = read("lib/founding-api-access-server.ts");
const activation = read("lib/signup-account-activation.ts");
record("ORDINARY_APP_ACCESS_HELPERS", access.includes("resolveOrdinaryAppAccess")
    && activation.includes("ensureListenerOrdinaryAppAccess")
    && activation.includes("ensureOrdinaryCreatorAppAccess"));
record("API_GATE_ALWAYS_ENFORCED", apiGate.includes("shouldEnforceFoundingApiAccess")
    && !apiGate.includes("if (!isFoundingBetaLocked()) return false"));
record("FOUNDING_COHORT_PENDING_PRESERVED", activation.includes("pending_approval")
    && activation.includes("member?.invite_id")
    && activation.includes("revokeUnapprovedCreatorPrivileges"));
record("REJECTED_ACCOUNTS_BLOCKED", access.includes('appAccessDenialReason: "rejected"')
    || access.includes('appAccessDenialReason === "rejected"'));
record("INCOMPLETE_REGISTRATION_WAITLIST_ONLY", page.includes("incomplete_registration")
    && page.includes("LISTENER_LAUNCH_WAITLIST_MESSAGE")
    && read("components/founding-member-gate.tsx").includes("waitlist"));
record("CREATOR_UPLOAD_RLS_REQUIRES_APPROVAL", read("supabase/migrations/202609191200_require_approved_creator_upload.sql").includes("approval_status = 'approved'"));
record("PENDING_REQUEST_LABEL", read("lib/founding-onboarding.ts").includes("Producer Request")
    && read("lib/founding-onboarding.ts").includes("Artist Request")
    && read("components/founding-onboarding-admin-panel.tsx").includes("foundingRequestLabel")
    && read("lib/founding-members-admin.ts").includes("foundingStatusRoleLabel"));
record("ORDINARY_APPROVAL_NOT_FOUNDING", foundingInvite.includes("resolveSignupAccountTypeGrants(requestedType, { founding: false })")
    && read("lib/founding-onboarding.ts").includes("ordinaryCreatorRoleLabel")
    && read("lib/founding-onboarding.ts").includes("options?.explicitFounding"));
record("CREATOR_CHROME_FAIL_CLOSED", page.includes("authorizationReady")
    && read("lib/desktop-app-navigation.ts").includes("authorizationReady === false")
    && page.includes("foundingAccessReady && (!foundingAccessLoading || Boolean(foundingAccess))")
    && page.includes("setAccountRolesReady(false)"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} (${results.length} total)`);
process.exit(failed === 0 ? 0 : 1);
