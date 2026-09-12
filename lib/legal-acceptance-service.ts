import {
    getCurrentPolicyVersion,
    isLegalPolicyType,
    type LegalAcceptanceInput,
    type LegalPolicyType,
    validateSignupAcceptanceInput,
} from "@/lib/legal-policies";
import type { SignupAccountType } from "@/lib/signup-account-type";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

const CREATOR_UPLOAD_POLICY: LegalPolicyType = "creator_upload";

export async function recordLegalAcceptances(input: {
    userId: string;
    acceptances: LegalAcceptanceInput[];
}) {
    if (!isUuid(input.userId)) {
        return { ok: false as const, status: 400, error: "Invalid user id." };
    }
    const normalized = input.acceptances
        .filter((entry) => isLegalPolicyType(entry.policyType))
        .map((entry) => ({
            policyType: entry.policyType,
            policyVersion: String(entry.policyVersion || "").trim(),
        }))
        .filter((entry) => entry.policyVersion.length > 0);

    if (normalized.length === 0) {
        return { ok: false as const, status: 400, error: "No policy acceptances provided." };
    }

    for (const entry of normalized) {
        if (entry.policyVersion !== getCurrentPolicyVersion(entry.policyType)) {
            return {
                ok: false as const,
                status: 400,
                error: `Policy version mismatch for ${entry.policyType}.`,
            };
        }
    }

    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();
    const rows = normalized.map((entry) => ({
        user_id: input.userId,
        policy_type: entry.policyType,
        policy_version: entry.policyVersion,
        accepted_at: now,
    }));

    const { data, error } = await supabase
        .from("legal_acceptances")
        .upsert(rows, { onConflict: "user_id,policy_type,policy_version", ignoreDuplicates: true })
        .select("id,policy_type,policy_version,accepted_at");

    if (error) throw new Error(getErrorMessage(error));

    return {
        ok: true as const,
        recorded: data?.length || 0,
        duplicate: (data?.length || 0) < rows.length,
        acceptances: data || [],
    };
}

export async function recordSignupLegalAcceptances(input: {
    userId: string;
    accountType: SignupAccountType;
    acceptances: LegalAcceptanceInput[];
}) {
    const validation = validateSignupAcceptanceInput(input.accountType, input.acceptances);
    if (!validation.ok) {
        return { ok: false as const, status: 400, error: validation.error, missing: validation.missing };
    }
    const recorded = await recordLegalAcceptances({
        userId: input.userId,
        acceptances: validation.acceptances,
    });
    if (!recorded.ok) return recorded;
    return { ...recorded, required: validation.required };
}

export async function hasAcceptedCurrentPolicy(userId: string, policyType: LegalPolicyType) {
    if (!isUuid(userId)) return false;
    const supabase = getSupabaseServerClient();
    const version = getCurrentPolicyVersion(policyType);
    const { data, error } = await supabase
        .from("legal_acceptances")
        .select("id")
        .eq("user_id", userId)
        .eq("policy_type", policyType)
        .eq("policy_version", version)
        .maybeSingle();
    if (error) throw new Error(getErrorMessage(error));
    return Boolean(data?.id);
}

export async function requireCurrentCreatorUploadAgreement(userId: string) {
    if (!isUuid(userId)) {
        return {
            ok: false as const,
            status: 401,
            error: "You must log in before uploading creator content.",
        };
    }
    const accepted = await hasAcceptedCurrentPolicy(userId, CREATOR_UPLOAD_POLICY);
    if (!accepted) {
        return {
            ok: false as const,
            status: 403,
            error: "You must accept the current Creator / Upload Agreement before uploading. Review it at /legal/creator-upload and accept it during signup or from your account settings.",
            policyPath: "/legal/creator-upload",
            policyType: CREATOR_UPLOAD_POLICY,
        };
    }
    return { ok: true as const };
}

export async function listUserLegalAcceptances(userId: string) {
    if (!isUuid(userId)) return [];
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
        .from("legal_acceptances")
        .select("policy_type,policy_version,accepted_at,created_at")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false });
    if (error) throw new Error(getErrorMessage(error));
    return data || [];
}
