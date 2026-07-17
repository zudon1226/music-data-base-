import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";
import { requireMatchingUserId } from "@/lib/request-auth";
import { ensureProfileRow } from "@/lib/sync-auth-user-metadata";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function extensionFor(mime: string) {
    if (mime === "image/png") return "png";
    if (mime === "image/webp") return "webp";
    if (mime === "image/gif") return "gif";
    return "jpg";
}

export async function POST(request: Request) {
    try {
        const form = await request.formData();
        const userId = String(form.get("userId") || "").trim();
        if (!userId || !isUuid(userId)) {
            return jsonResponse({ error: "Valid userId is required." }, 400);
        }
        const auth = await requireMatchingUserId(request, "/api/profile-avatar", userId);
        if (!auth.ok) {
            return jsonResponse({ error: auth.error }, auth.status);
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
            return jsonResponse({ error: "Avatar file is required." }, 400);
        }
        if (!ALLOWED_TYPES.has(file.type)) {
            return jsonResponse({ error: "Avatar must be JPEG, PNG, WebP, or GIF." }, 400);
        }
        if (file.size <= 0 || file.size > MAX_BYTES) {
            return jsonResponse({ error: "Avatar must be under 2MB." }, 400);
        }

        const supabase = getSupabaseServerClient();
        const ext = extensionFor(file.type);
        const path = `${userId}/avatar-${Date.now()}.${ext}`;
        const bytes = Buffer.from(await file.arrayBuffer());

        const upload = await supabase.storage.from("avatars").upload(path, bytes, {
            contentType: file.type,
            upsert: true,
        });
        if (upload.error) {
            return jsonResponse({ error: getErrorMessage(upload.error) }, 500);
        }

        const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
        // Bucket is private — use signed URL for display; also store path-based public URL if policy allows signed reads
        const signed = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
        const avatarUrl = signed.data?.signedUrl || publicData.publicUrl || path;

        await ensureProfileRow(supabase, userId, { avatarUrl });
        const updateResult = await supabase
            .from("profiles")
            .update({
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString(),
            })
            .or(`id.eq.${userId},user_id.eq.${userId}`);

        if (updateResult.error) {
            return jsonResponse({ error: getErrorMessage(updateResult.error) }, 500);
        }

        return jsonResponse({ ok: true, avatarUrl, path });
    }
    catch (error) {
        console.error("[api/profile-avatar] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
