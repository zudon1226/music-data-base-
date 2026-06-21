import { createClient } from "@supabase/supabase-js";
import { canUserUpload, UPLOAD_LOCK_MESSAGE, areUploadsLocked } from "@/lib/upload-lock";
import { getBearerToken } from "@/lib/request-auth";
import { getSupabaseServerClient } from "@/lib/server-supabase";
import { SUPABASE_PROJECT_URL } from "@/lib/supabase-config";

type UploadLockFailure = {
    ok: false;
    status: number;
    error: string;
};

type UploadLockSuccess = {
    ok: true;
    userId?: string;
    email?: string;
};

export function uploadLockJsonBody() {
    return {
        error: UPLOAD_LOCK_MESSAGE,
        uploadsLocked: true,
    };
}

async function getUserEmailById(userId: string) {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase.auth.admin.getUserById(userId);
    return data.user?.email || "";
}

export async function requireUploadAllowedForUserId(userId: string): Promise<UploadLockSuccess | UploadLockFailure> {
    if (!areUploadsLocked()) {
        return { ok: true, userId };
    }
    const cleanUserId = userId.trim();
    if (!cleanUserId) {
        return { ok: false, status: 401, error: "Log in before uploading." };
    }
    const email = await getUserEmailById(cleanUserId);
    if (canUserUpload(email)) {
        return { ok: true, userId: cleanUserId, email };
    }
    return { ok: false, status: 503, error: UPLOAD_LOCK_MESSAGE };
}

export async function requireUploadAllowedForRequest(request: Request): Promise<UploadLockSuccess | UploadLockFailure> {
    if (!areUploadsLocked()) {
        return { ok: true };
    }
    const token = getBearerToken(request);
    if (!token) {
        return { ok: false, status: 401, error: "Missing authorization token." };
    }
    const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "");
    if (!anonKey) {
        return { ok: false, status: 500, error: "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing." };
    }
    const authClient = createClient(SUPABASE_PROJECT_URL, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await authClient.auth.getUser(token);
    const email = data.user?.email || "";
    if (error || !data.user?.id) {
        return { ok: false, status: 401, error: error?.message || "Invalid session token." };
    }
    if (canUserUpload(email)) {
        return { ok: true, userId: data.user.id, email };
    }
    return { ok: false, status: 503, error: UPLOAD_LOCK_MESSAGE };
}
