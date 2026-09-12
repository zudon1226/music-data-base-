/**
 * Sponsor applications, packages, assets, placements — server-side business logic.
 * Platform revenue only — no creator earnings.
 */

import {
    SPONSOR_APPLICANT_EDITABLE_STATUSES,
    SPONSOR_ASSET_MAX_BYTES,
    SPONSOR_ALLOWED_IMAGE_MIME_TYPES,
    SPONSOR_STORAGE_BUCKET,
    type SponsorApplicationStatus,
    type SponsorPaymentStatus,
} from "@/lib/sponsor-constants";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

function sanitizeText(value: unknown, max = 2000) {
    return String(value || "").trim().slice(0, max);
}

export async function listActiveSponsorPackages() {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_packages")
        .select("*")
        .eq("active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return data || [];
}

export async function listAllSponsorPackages() {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_packages")
        .select("*")
        .order("display_order", { ascending: true });
    if (error) throw new Error(getErrorMessage(error));
    return data || [];
}

export async function getSponsorPackageById(packageId: string) {
    if (!isUuid(packageId)) return null;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_packages")
        .select("*")
        .eq("id", packageId)
        .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}

export async function upsertSponsorPackage(input: Record<string, unknown>) {
    const supabase = getSupabaseServerClient();
    const id = String(input.id || "").trim();
    const row = {
        name: sanitizeText(input.name, 160),
        description: sanitizeText(input.description, 4000),
        price_cents: Math.max(0, Math.round(Number(input.price_cents ?? input.priceCents) || 0)),
        currency: String(input.currency || "USD").trim().toUpperCase().slice(0, 3) || "USD",
        duration_days: input.duration_days != null || input.durationDays != null
            ? Math.max(1, Math.round(Number(input.duration_days ?? input.durationDays) || 0)) || null
            : null,
        duration_label: sanitizeText(input.duration_label ?? input.durationLabel, 120),
        placement_type: sanitizeText(input.placement_type ?? input.placementType, 80) || "home_featured",
        active: input.active !== false,
        display_order: Math.round(Number(input.display_order ?? input.displayOrder) || 100),
        stripe_product_id: sanitizeText(input.stripe_product_id ?? input.stripeProductId, 120) || null,
        stripe_price_id: sanitizeText(input.stripe_price_id ?? input.stripePriceId, 120) || null,
    };
    if (!row.name) throw new Error("Package name is required.");

    if (id && isUuid(id)) {
        const { data, error } = await supabase.from("sponsor_packages").update(row).eq("id", id).select("*").single();
        if (error) throw new Error(getErrorMessage(error));
        return data;
    }
    const { data, error } = await supabase.from("sponsor_packages").insert(row).select("*").single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}

export async function listUserSponsorApplications(userId: string) {
    if (!isUuid(userId)) return [];
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_applications")
        .select("*, sponsor_packages(name, placement_type, duration_label)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return data || [];
}

export async function getSponsorApplication(applicationId: string, userId?: string, admin = false) {
    if (!isUuid(applicationId)) return null;
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_applications")
        .select("*, sponsor_packages(name, placement_type, duration_label, price_cents, currency)")
        .eq("id", applicationId)
        .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    if (!data) return null;
    if (!admin && userId && data.user_id !== userId) return null;
    return data;
}

export async function createSponsorApplication(input: {
    userId: string;
    businessName: string;
    contactName: string;
    email: string;
    phone?: string;
    website?: string;
    companyDescription?: string;
    packageId?: string;
    requestedPlacement?: string;
    campaignStartPreference?: string;
    campaignEndPreference?: string;
    notes?: string;
    submit?: boolean;
}) {
    if (!isUuid(input.userId)) throw new Error("Valid user id is required.");
    const businessName = sanitizeText(input.businessName, 200);
    const contactName = sanitizeText(input.contactName, 160);
    const email = sanitizeText(input.email, 320);
    if (!businessName || !contactName || !email) {
        throw new Error("Business name, contact name, and email are required.");
    }

    let amountCents = 0;
    let currency = "USD";
    let requestedPlacement = sanitizeText(input.requestedPlacement, 80) || "home_featured";
    const packageId = String(input.packageId || "").trim();

    if (packageId && isUuid(packageId)) {
        const pkg = await getSponsorPackageById(packageId);
        if (!pkg || !pkg.active) throw new Error("Selected sponsor package is not available.");
        amountCents = Math.max(0, Number(pkg.price_cents) || 0);
        currency = String(pkg.currency || "USD").toUpperCase();
        requestedPlacement = String(pkg.placement_type || requestedPlacement);
    }

    const row = {
        user_id: input.userId,
        business_name: businessName,
        contact_name: contactName,
        email,
        phone: sanitizeText(input.phone, 40) || null,
        website: sanitizeText(input.website, 500) || null,
        company_description: sanitizeText(input.companyDescription, 4000),
        package_id: packageId && isUuid(packageId) ? packageId : null,
        requested_placement: requestedPlacement,
        campaign_start_preference: input.campaignStartPreference || null,
        campaign_end_preference: input.campaignEndPreference || null,
        notes: sanitizeText(input.notes, 4000),
        status: input.submit ? "submitted" as const : "draft" as const,
        payment_status: "unpaid" as const,
        amount_cents: amountCents,
        currency,
        headline: businessName,
    };

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("sponsor_applications").insert(row).select("*").single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}

export async function updateSponsorApplicationByUser(input: {
    applicationId: string;
    userId: string;
    updates: Record<string, unknown>;
}) {
    const existing = await getSponsorApplication(input.applicationId, input.userId);
    if (!existing) throw new Error("Sponsor application not found.");
    if (!SPONSOR_APPLICANT_EDITABLE_STATUSES.has(existing.status as SponsorApplicationStatus)) {
        throw new Error("This application can no longer be edited.");
    }

    const updates: Record<string, unknown> = {};
    if (input.updates.businessName != null) updates.business_name = sanitizeText(input.updates.businessName, 200);
    if (input.updates.contactName != null) updates.contact_name = sanitizeText(input.updates.contactName, 160);
    if (input.updates.email != null) updates.email = sanitizeText(input.updates.email, 320);
    if (input.updates.phone != null) updates.phone = sanitizeText(input.updates.phone, 40) || null;
    if (input.updates.website != null) updates.website = sanitizeText(input.updates.website, 500) || null;
    if (input.updates.companyDescription != null) {
        updates.company_description = sanitizeText(input.updates.companyDescription, 4000);
    }
    if (input.updates.notes != null) updates.notes = sanitizeText(input.updates.notes, 4000);
    if (input.updates.requestedPlacement != null) {
        updates.requested_placement = sanitizeText(input.updates.requestedPlacement, 80);
    }
    if (input.updates.campaignStartPreference != null) {
        updates.campaign_start_preference = input.updates.campaignStartPreference || null;
    }
    if (input.updates.campaignEndPreference != null) {
        updates.campaign_end_preference = input.updates.campaignEndPreference || null;
    }
    if (input.updates.submit === true) updates.status = "submitted";
    if (input.updates.packageId != null) {
        const packageId = String(input.updates.packageId || "").trim();
        if (packageId && isUuid(packageId)) {
            const pkg = await getSponsorPackageById(packageId);
            if (!pkg?.active) throw new Error("Selected sponsor package is not available.");
            updates.package_id = packageId;
            updates.amount_cents = Math.max(0, Number(pkg.price_cents) || 0);
            updates.currency = String(pkg.currency || "USD").toUpperCase();
            updates.requested_placement = String(pkg.placement_type || existing.requested_placement);
        }
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_applications")
        .update(updates)
        .eq("id", input.applicationId)
        .eq("user_id", input.userId)
        .select("*")
        .single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}

export async function adminUpdateSponsorApplication(input: {
    applicationId: string;
    adminUserId: string;
    status?: SponsorApplicationStatus;
    paymentStatus?: SponsorPaymentStatus;
    rejectionReason?: string;
    amountCents?: number;
    packageId?: string;
    requestedPlacement?: string;
    scheduledStartAt?: string;
    scheduledEndAt?: string;
    headline?: string;
    destinationUrl?: string;
    activate?: boolean;
    deactivate?: boolean;
    expire?: boolean;
}) {
    if (!isUuid(input.applicationId) || !isUuid(input.adminUserId)) {
        throw new Error("Invalid application or admin id.");
    }
    const existing = await getSponsorApplication(input.applicationId, undefined, true);
    if (!existing) throw new Error("Sponsor application not found.");

    const updates: Record<string, unknown> = {};
    if (input.status) updates.status = input.status;
    if (input.paymentStatus) updates.payment_status = input.paymentStatus;
    if (input.rejectionReason != null) updates.rejection_reason = sanitizeText(input.rejectionReason, 2000);
    if (input.amountCents != null) updates.amount_cents = Math.max(0, Math.round(input.amountCents));
    if (input.packageId && isUuid(input.packageId)) updates.package_id = input.packageId;
    if (input.requestedPlacement != null) {
        updates.requested_placement = sanitizeText(input.requestedPlacement, 80);
    }
    if (input.scheduledStartAt != null) updates.scheduled_start_at = input.scheduledStartAt || null;
    if (input.scheduledEndAt != null) updates.scheduled_end_at = input.scheduledEndAt || null;
    if (input.headline != null) updates.headline = sanitizeText(input.headline, 200);
    if (input.destinationUrl != null) updates.destination_url = sanitizeText(input.destinationUrl, 500) || null;

    if (input.status === "approved") {
        updates.approved_by = input.adminUserId;
        updates.approved_at = new Date().toISOString();
    }
    if (input.status === "rejected") {
        updates.rejected_at = new Date().toISOString();
    }
    if (input.activate) {
        updates.status = "active";
        updates.activated_at = new Date().toISOString();
        if (!updates.scheduled_start_at && !existing.scheduled_start_at) {
            updates.scheduled_start_at = new Date().toISOString();
        }
    }
    if (input.deactivate) {
        updates.status = "scheduled";
    }
    if (input.expire) {
        updates.status = "expired";
        updates.scheduled_end_at = new Date().toISOString();
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_applications")
        .update(updates)
        .eq("id", input.applicationId)
        .select("*")
        .single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}

export async function listAdminSponsorApplications(status?: string) {
    const supabase = getSupabaseServerClient();
    let query = supabase
        .from("sponsor_applications")
        .select("*, sponsor_packages(name, placement_type)")
        .order("created_at", { ascending: false })
        .limit(200);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw new Error(getErrorMessage(error));
    return data || [];
}

export async function listActiveSponsorPlacements(placementType?: string) {
    const supabase = getSupabaseServerClient();
    let query = supabase
        .from("sponsor_applications")
        .select(`
            id, business_name, headline, destination_url, requested_placement,
            scheduled_start_at, scheduled_end_at, status, payment_status, activated_at,
            sponsor_assets(id, asset_type, storage_path, alt_text, destination_url, approval_status)
        `)
        .eq("status", "active")
        .eq("payment_status", "paid");

    if (placementType) query = query.eq("requested_placement", placementType);

    const { data, error } = await query.order("activated_at", { ascending: false }).limit(50);
    if (error) throw new Error(getErrorMessage(error));

    const now = Date.now();
    return (data || [])
        .filter((row) => {
            const start = row.scheduled_start_at ? Date.parse(String(row.scheduled_start_at)) : 0;
            const end = row.scheduled_end_at ? Date.parse(String(row.scheduled_end_at)) : Number.POSITIVE_INFINITY;
            if (Number.isFinite(start) && start > now) return false;
            if (Number.isFinite(end) && end <= now) return false;
            return true;
        })
        .map((row) => {
            const assets = Array.isArray(row.sponsor_assets) ? row.sponsor_assets : [];
            const approved = assets.filter((a: { approval_status?: string }) => a.approval_status === "approved");
            return { ...row, sponsor_assets: approved };
        });
}

export async function createSponsorAssetRecord(input: {
    applicationId: string;
    userId: string;
    assetType: string;
    storagePath: string;
    mimeType: string;
    fileSizeBytes?: number;
    altText?: string;
    destinationUrl?: string;
}) {
    if (!isUuid(input.applicationId) || !isUuid(input.userId)) {
        throw new Error("Invalid application or user id.");
    }
    const mime = String(input.mimeType || "").trim().toLowerCase();
    if (!(SPONSOR_ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
        throw new Error("Unsupported image type.");
    }
    if (input.fileSizeBytes != null && input.fileSizeBytes > SPONSOR_ASSET_MAX_BYTES) {
        throw new Error("File exceeds maximum size.");
    }
    if (!input.storagePath.startsWith(`${input.userId}/`)) {
        throw new Error("Storage path must be owner-scoped.");
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.from("sponsor_assets").insert({
        application_id: input.applicationId,
        user_id: input.userId,
        asset_type: sanitizeText(input.assetType, 40) || "logo",
        storage_path: sanitizeText(input.storagePath, 500),
        mime_type: mime,
        file_size_bytes: input.fileSizeBytes ?? null,
        alt_text: sanitizeText(input.altText, 500),
        destination_url: sanitizeText(input.destinationUrl, 500) || null,
        approval_status: "pending",
    }).select("*").single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}

export async function adminReviewSponsorAsset(input: {
    assetId: string;
    adminUserId: string;
    approvalStatus: "approved" | "rejected";
    rejectionReason?: string;
}) {
    if (!isUuid(input.assetId) || !isUuid(input.adminUserId)) {
        throw new Error("Invalid asset or admin id.");
    }
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_assets")
        .update({
            approval_status: input.approvalStatus,
            reviewed_by: input.adminUserId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: input.approvalStatus === "rejected"
                ? sanitizeText(input.rejectionReason, 2000)
                : null,
        })
        .eq("id", input.assetId)
        .select("*")
        .single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}

export async function getSignedSponsorAssetUrl(storagePath: string, expiresIn = 3600) {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.storage
        .from(SPONSOR_STORAGE_BUCKET)
        .createSignedUrl(storagePath, expiresIn);
    if (error || !data?.signedUrl) throw new Error(getErrorMessage(error) || "Unable to sign asset URL.");
    return data.signedUrl;
}

export function buildSponsorAssetStoragePath(userId: string, assetType: string, ext: string) {
    const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "png";
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${userId}/${assetType}/${token}.${safeExt}`;
}

export async function prepareSponsorCheckoutApplication(applicationId: string, userId: string) {
    const app = await getSponsorApplication(applicationId, userId);
    if (!app) throw new Error("Sponsor application not found.");
    if (!["approved", "payment_pending"].includes(String(app.status))) {
        throw new Error("Application must be approved before payment.");
    }
    const amountCents = Math.max(0, Number(app.amount_cents) || 0);
    if (amountCents <= 0) throw new Error("Sponsor package amount is invalid.");

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("sponsor_applications")
        .update({
            status: "payment_pending",
            payment_status: "pending",
        })
        .eq("id", applicationId)
        .eq("user_id", userId)
        .select("*")
        .single();
    if (error) throw new Error(getErrorMessage(error));
    return data;
}
