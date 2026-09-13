import { NextResponse } from "next/server";
import { getBearerToken, getSessionTokensFromRecord, requireMatchingUserId } from "@/lib/request-auth";
import { createSupportAuthenticatedClient } from "@/lib/support-authenticated-client";
import {
    mapTicketRowForUser,
    normalizeSupportCategory,
    normalizeSupportSeverity,
    redactSupportText,
    sanitizeDiagnostics,
    SUPPORT_TICKET_USER_SELECT,
} from "@/lib/support-tickets";
import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCREENSHOT_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function isMissingSupportSetup(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("support_tickets") || message.includes("schema cache") || message.includes("does not exist");
}

async function requireSupportUser(request: Request, userId: string, body?: Record<string, unknown>) {
    if (!isUuid(userId)) {
        return { ok: false as const, status: 401 as const, error: "Sign in to submit support feedback." };
    }
    const auth = await requireMatchingUserId(
        request,
        "/api/support/tickets",
        userId,
        body ? getSessionTokensFromRecord(body) : undefined,
    );
    if (!auth.ok) return auth;
    const accessToken = getBearerToken(request);
    if (!accessToken) {
        return { ok: false as const, status: 401 as const, error: "Missing or invalid Authorization bearer token." };
    }
    return { ok: true as const, userId: auth.userId, accessToken };
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        const auth = await requireSupportUser(request, userId);
        if (!auth.ok) return jsonResponse({ error: auth.error, tickets: [] }, auth.status);

        const supabase = createSupportAuthenticatedClient(auth.accessToken);
        const { data, error } = await supabase
            .from("support_tickets")
            .select(SUPPORT_TICKET_USER_SELECT)
            .eq("user_id", auth.userId)
            .order("created_at", { ascending: false })
            .limit(50);

        if (error) {
            if (isMissingSupportSetup(error)) {
                return jsonResponse({ tickets: [], setupRequired: true });
            }
            return jsonResponse({ error: getErrorMessage(error), tickets: [] }, 500);
        }

        return jsonResponse({ tickets: (data || []).map((row) => mapTicketRowForUser(row as Record<string, unknown>)) });
    }
    catch (error) {
        console.error("[api/support/tickets] GET failed:", error);
        return jsonResponse({ error: getErrorMessage(error), tickets: [] }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get("content-type") || "";
        let userId = "";
        let categoryRaw = "";
        let subject = "";
        let description = "";
        let accountType = "";
        let severityRaw = "medium";
        let diagnostics = sanitizeDiagnostics({});
        let screenshotFile: File | null = null;

        if (contentType.includes("multipart/form-data")) {
            const form = await request.formData();
            userId = String(form.get("userId") || form.get("user_id") || "").trim();
            categoryRaw = String(form.get("category") || "").trim();
            subject = String(form.get("subject") || "").trim();
            description = String(form.get("description") || "").trim();
            accountType = String(form.get("accountType") || form.get("account_type") || "").trim();
            severityRaw = String(form.get("severity") || "medium").trim();
            diagnostics = sanitizeDiagnostics({
                pagePath: String(form.get("pagePath") || form.get("page_path") || ""),
                deviceType: String(form.get("deviceType") || form.get("device_type") || ""),
                browser: String(form.get("browser") || ""),
                appErrorCode: String(form.get("appErrorCode") || form.get("app_error_code") || ""),
                requestId: String(form.get("requestId") || form.get("request_id") || ""),
                uploadType: String(form.get("uploadType") || form.get("upload_type") || ""),
                fileType: String(form.get("fileType") || form.get("file_type") || ""),
                fileSize: Number(form.get("fileSize") || form.get("file_size") || 0),
                uploadStage: String(form.get("uploadStage") || form.get("upload_stage") || ""),
            });
            const file = form.get("screenshot");
            screenshotFile = file instanceof File && file.size > 0 ? file : null;
        }
        else {
            const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
            userId = String(body.userId || body.user_id || "").trim();
            categoryRaw = String(body.category || "").trim();
            subject = String(body.subject || "").trim();
            description = String(body.description || "").trim();
            accountType = String(body.accountType || body.account_type || "").trim();
            severityRaw = String(body.severity || "medium").trim();
            const diag = (body.diagnostics && typeof body.diagnostics === "object")
                ? body.diagnostics as Record<string, unknown>
                : body;
            diagnostics = sanitizeDiagnostics({
                pagePath: String(diag.pagePath || diag.page_path || ""),
                deviceType: String(diag.deviceType || diag.device_type || ""),
                browser: String(diag.browser || ""),
                appErrorCode: String(diag.appErrorCode || diag.app_error_code || ""),
                requestId: String(diag.requestId || diag.request_id || ""),
                uploadType: String(diag.uploadType || diag.upload_type || ""),
                fileType: String(diag.fileType || diag.file_type || ""),
                fileSize: Number(diag.fileSize || diag.file_size || 0),
                uploadStage: String(diag.uploadStage || diag.upload_stage || ""),
            });
        }

        const auth = await requireSupportUser(request, userId, { userId });
        if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

        const category = normalizeSupportCategory(categoryRaw);
        if (!category) return jsonResponse({ error: "Choose a valid category." }, 400);
        subject = redactSupportText(subject, 200);
        description = redactSupportText(description, 8000);
        if (!subject) return jsonResponse({ error: "Subject is required." }, 400);
        if (!description) return jsonResponse({ error: "Description is required." }, 400);

        const severity = normalizeSupportSeverity(severityRaw);
        accountType = redactSupportText(accountType, 80);

        const supabase = createSupportAuthenticatedClient(auth.accessToken);
        const { data: profile } = await getSupabaseServerClient()
            .from("profiles")
            .select("display_name,username")
            .or(`id.eq.${auth.userId},user_id.eq.${auth.userId}`)
            .limit(1)
            .maybeSingle();

        const userName = String(profile?.display_name || profile?.username || "").trim();

        const { data: inserted, error: insertError } = await supabase
            .from("support_tickets")
            .insert({
                user_id: auth.userId,
                user_name: userName,
                category,
                subject,
                description,
                title: subject,
                body: description,
                severity,
                priority: severity,
                status: "new",
                account_type: accountType || null,
                page_path: diagnostics.pagePath || null,
                device_type: diagnostics.deviceType || null,
                browser: diagnostics.browser || null,
                app_error_code: diagnostics.appErrorCode || null,
                request_id: diagnostics.requestId || null,
                upload_type: diagnostics.uploadType || null,
                file_type: diagnostics.fileType || null,
                file_size: diagnostics.fileSize ?? null,
                upload_stage: diagnostics.uploadStage || null,
            })
            .select(SUPPORT_TICKET_USER_SELECT)
            .single();

        if (insertError) {
            if (isMissingSupportSetup(insertError)) {
                return jsonResponse({ error: "Support system is not configured yet. Run the support migration." }, 503);
            }
            return jsonResponse({ error: getErrorMessage(insertError) }, 500);
        }

        let ticket = mapTicketRowForUser(inserted as Record<string, unknown>);

        if (screenshotFile) {
            const mime = (screenshotFile.type || "").toLowerCase();
            if (!SCREENSHOT_MIME.has(mime)) {
                return jsonResponse({ error: "Screenshot must be PNG, JPG, or WEBP.", ticket }, 400);
            }
            if (screenshotFile.size > MAX_SCREENSHOT_BYTES) {
                return jsonResponse({ error: "Screenshot must be 5 MB or smaller.", ticket }, 400);
            }
            const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
            const objectPath = `${auth.userId}/${ticket.id}/screenshot.${ext}`;
            const buffer = Buffer.from(await screenshotFile.arrayBuffer());
            const service = getSupabaseServerClient();
            const upload = await service.storage.from("support-attachments").upload(objectPath, buffer, {
                contentType: mime,
                upsert: true,
            });
            if (upload.error) {
                return jsonResponse({ error: getErrorMessage(upload.error), ticket }, 500);
            }
            const { data: updated, error: pathError } = await supabase
                .from("support_tickets")
                .update({ screenshot_path: objectPath })
                .eq("id", ticket.id)
                .eq("user_id", auth.userId)
                .select(SUPPORT_TICKET_USER_SELECT)
                .single();
            if (!pathError && updated) {
                ticket = mapTicketRowForUser(updated as Record<string, unknown>);
            }
        }

        return jsonResponse({ ok: true, ticket });
    }
    catch (error) {
        console.error("[api/support/tickets] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
