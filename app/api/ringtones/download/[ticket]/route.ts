import { NextResponse } from "next/server";
import { RINGTONE_STORAGE_BUCKETS } from "@/lib/ringtone-constants";
import { buildRingtoneContentDisposition } from "@/lib/ringtone-download-filename";
import { consumeRingtoneDownloadTicket } from "@/lib/ringtone-download-ticket";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

type Params = { params: Promise<{ ticket: string }> };

/**
 * Same-origin top-level attachment delivery for iPhone Safari.
 * Consumes a short-lived single-use ticket and streams audio bytes.
 * Never redirects to Supabase Storage.
 */
export async function GET(_request: Request, context: Params) {
    try {
        const { ticket: rawTicketParam } = await context.params;
        const rawTicket = decodeURIComponent(String(rawTicketParam || "").trim());
        if (!rawTicket) {
            return json({ error: "Download ticket is required.", code: "TICKET_MISSING" }, 404);
        }

        let record;
        try {
            record = await consumeRingtoneDownloadTicket(rawTicket);
        } catch (error) {
            return json({ error: getErrorMessage(error) }, 500);
        }

        if (!record) {
            return json({
                error: "Download ticket is invalid, expired, or already used.",
                code: "TICKET_INVALID",
            }, 410);
        }

        const supabase = getSupabaseServerClient();
        const downloaded = await supabase.storage
            .from(RINGTONE_STORAGE_BUCKETS.downloads)
            .download(record.storagePath);
        if (downloaded.error || !downloaded.data) {
            const message = getErrorMessage(downloaded.error) || "Unable to load ringtone audio.";
            const missing = /not found|does not exist|404|Object not found/i.test(message);
            return json({
                error: message,
                code: missing ? "FILE_NOT_FOUND" : "AUDIO_FETCH_FAILED",
            }, missing ? 404 : 500);
        }

        // Count exactly once per successful ticket redemption.
        if (record.purchaseId) {
            await supabase.from("ringtone_downloads").insert({
                ringtone_id: record.ringtoneId,
                buyer_id: record.userId,
                purchase_id: record.purchaseId,
                device_type: "iphone",
            });
        }

        const bytes = Buffer.from(await downloaded.data.arrayBuffer());
        const contentDisposition = buildRingtoneContentDisposition(record.filename);

        return new NextResponse(bytes, {
            status: 200,
            headers: {
                "Content-Type": record.contentType,
                "Content-Disposition": contentDisposition,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Length": String(bytes.byteLength),
            },
        });
    } catch (error) {
        console.error("[api/ringtones/download/:ticket] failed:", error);
        return json({ error: getErrorMessage(error) }, 500);
    }
}
