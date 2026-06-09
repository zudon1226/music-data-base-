import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LICENSE_TABLE = "license_records";
const LICENSE_TYPES = new Set(["Basic", "Premium", "Unlimited", "Exclusive"]);

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === "string")
        return error;
    if (error && typeof error === "object") {
        const record = error as Record<string, unknown>;
        return String(record.message || record.error || JSON.stringify(record));
    }
    return "Unknown server error";
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);
}

function isMissingLicenseTable(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes("license_records") || message.includes("schema cache") || message.includes("does not exist");
}

function getSupabaseServerClient(request?: Request) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const authorization = request?.headers.get("authorization") || "";
    if (!supabaseUrl)
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
    if (serviceRoleKey && serviceRoleKey !== "your_service_role_key_here") {
        return createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    if (!anonKey)
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing.");
    if (!authorization) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing and no user authorization token was sent.");
    }
    return createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authorization } },
    });
}

function mapLicenseRow(row: Record<string, unknown>) {
    return {
        id: String(row.id || ""),
        userId: String(row.user_id || ""),
        beatId: String(row.beat_id || ""),
        beatTitle: String(row.beat_title || ""),
        producerId: String(row.producer_id || ""),
        producerName: String(row.producer_name || ""),
        buyerName: String(row.buyer_name || ""),
        licenseType: String(row.license_type || "Basic"),
        priceCents: Number(row.price_cents || 0),
        currency: String(row.currency || "USD"),
        issuedAt: String(row.issued_at || row.created_at || new Date().toISOString()),
        terms: Array.isArray(row.terms) ? row.terms.map((term) => String(term)) : [],
        pdfFileName: String(row.pdf_file_name || "music-data-base-license.pdf"),
        transactionId: String(row.transaction_id || ""),
    };
}

export async function GET(request: Request) {
    try {
        const userId = new URL(request.url).searchParams.get("userId")?.trim() || "";
        if (!userId || !isUuid(userId))
            return jsonResponse({ licenses: [] });
        const supabase = getSupabaseServerClient(request);
        const { data, error } = await supabase
            .from(LICENSE_TABLE)
            .select("id,user_id,beat_id,beat_title,producer_id,producer_name,buyer_name,license_type,price_cents,currency,pdf_file_name,terms,transaction_id,issued_at,created_at")
            .eq("user_id", userId)
            .order("issued_at", { ascending: false });
        if (error) {
            if (isMissingLicenseTable(error))
                return jsonResponse({ licenses: [], setupRequired: true, error: error.message });
            console.error("[api/licenses] load failed:", error);
            return jsonResponse({ licenses: [], error: error.message || getErrorMessage(error) }, 500);
        }
        return jsonResponse({ licenses: (data || []).map((row) => mapLicenseRow(row as Record<string, unknown>)) });
    }
    catch (error) {
        console.error("[api/licenses] load failed:", error);
        return jsonResponse({ licenses: [], error: getErrorMessage(error) }, 500);
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(body.userId || body.user_id || "").trim();
        const beatId = String(body.beatId || body.beat_id || "").trim();
        const licenseType = String(body.licenseType || body.license_type || "Basic");
        if (!userId || !isUuid(userId))
            return jsonResponse({ error: "License requires a valid user id." }, 401);
        if (!beatId)
            return jsonResponse({ error: "License requires a beat id." }, 400);
        if (!LICENSE_TYPES.has(licenseType))
            return jsonResponse({ error: "License type must be Basic, Premium, Unlimited, or Exclusive." }, 400);
        const payload = {
            id: String(body.id || crypto.randomUUID()),
            user_id: userId,
            beat_id: beatId,
            beat_title: String(body.beatTitle || body.beat_title || "Untitled Beat"),
            producer_id: String(body.producerId || body.producer_id || ""),
            producer_name: String(body.producerName || body.producer_name || ""),
            buyer_name: String(body.buyerName || body.buyer_name || ""),
            license_type: licenseType,
            price_cents: Math.max(0, Number(body.priceCents || body.price_cents || 0)),
            currency: String(body.currency || "USD"),
            pdf_file_name: String(body.pdfFileName || body.pdf_file_name || "music-data-base-license.pdf"),
            terms: Array.isArray(body.terms) ? body.terms.map((term) => String(term)) : [],
            transaction_id: String(body.transactionId || body.transaction_id || ""),
            issued_at: String(body.issuedAt || body.issued_at || new Date().toISOString()),
        };
        const supabase = getSupabaseServerClient(request);
        const { data, error } = await supabase
            .from(LICENSE_TABLE)
            .upsert(payload, { onConflict: "user_id,beat_id,license_type" })
            .select("id,user_id,beat_id,beat_title,producer_id,producer_name,buyer_name,license_type,price_cents,currency,pdf_file_name,terms,transaction_id,issued_at,created_at")
            .single();
        if (error) {
            if (isMissingLicenseTable(error))
                return jsonResponse({ ok: false, setupRequired: true, error: error.message }, 200);
            console.error("[api/licenses] save failed:", error);
            return jsonResponse({ error: error.message || getErrorMessage(error) }, 500);
        }
        return jsonResponse({ ok: true, license: data ? mapLicenseRow(data as Record<string, unknown>) : null });
    }
    catch (error) {
        console.error("[api/licenses] save failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}
