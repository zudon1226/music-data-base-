import { createHash, randomBytes } from "node:crypto";
import { getErrorMessage, getSupabaseServerClient } from "@/lib/server-supabase";

export const RINGTONE_DOWNLOAD_TICKET_TTL_MS = 60_000;

export type RingtoneDownloadTicketRecord = {
    ticketHash: string;
    userId: string;
    ringtoneId: string;
    purchaseId: string | null;
    storagePath: string;
    filename: string;
    contentType: string;
    expiresAt: string;
    consumedAt: string | null;
};

type GlobalTicketStore = {
    __ringtoneDownloadTickets?: Map<string, RingtoneDownloadTicketRecord>;
};

function memoryStore() {
    const globalRef = globalThis as typeof globalThis & GlobalTicketStore;
    if (!globalRef.__ringtoneDownloadTickets) {
        globalRef.__ringtoneDownloadTickets = new Map();
    }
    return globalRef.__ringtoneDownloadTickets;
}

export function hashRingtoneDownloadTicket(rawTicket: string) {
    return createHash("sha256").update(String(rawTicket || ""), "utf8").digest("hex");
}

export function issueRawRingtoneDownloadTicket() {
    return randomBytes(32).toString("base64url");
}

function isMissingTableError(error: unknown) {
    const message = getErrorMessage(error);
    return /ringtone_download_tickets|42P01|does not exist|Could not find the table/i.test(message);
}

export async function createRingtoneDownloadTicket(input: {
    userId: string;
    ringtoneId: string;
    purchaseId?: string | null;
    storagePath: string;
    filename: string;
    contentType: string;
}) {
    const rawTicket = issueRawRingtoneDownloadTicket();
    const ticketHash = hashRingtoneDownloadTicket(rawTicket);
    const expiresAt = new Date(Date.now() + RINGTONE_DOWNLOAD_TICKET_TTL_MS).toISOString();
    const record: RingtoneDownloadTicketRecord = {
        ticketHash,
        userId: input.userId,
        ringtoneId: input.ringtoneId,
        purchaseId: input.purchaseId || null,
        storagePath: input.storagePath,
        filename: input.filename,
        contentType: input.contentType,
        expiresAt,
        consumedAt: null,
    };

    const supabase = getSupabaseServerClient();
    const inserted = await supabase.from("ringtone_download_tickets").insert({
        ticket_hash: ticketHash,
        user_id: input.userId,
        ringtone_id: input.ringtoneId,
        purchase_id: input.purchaseId || null,
        storage_path: input.storagePath,
        filename: input.filename,
        content_type: input.contentType,
        expires_at: expiresAt,
    });

    if (inserted.error) {
        if (!isMissingTableError(inserted.error)) {
            throw new Error(getErrorMessage(inserted.error) || "Unable to create download ticket.");
        }
        // Local/dev fallback before migration is applied (single-instance only).
        memoryStore().set(ticketHash, record);
    }

    return {
        ticket: rawTicket,
        downloadUrl: `/api/ringtones/download/${encodeURIComponent(rawTicket)}`,
        expiresAt,
        expiresInSeconds: Math.floor(RINGTONE_DOWNLOAD_TICKET_TTL_MS / 1000),
    };
}

/**
 * Atomically consume a ticket. Returns null when missing, expired, or already used.
 */
export async function consumeRingtoneDownloadTicket(rawTicket: string) {
    const ticket = String(rawTicket || "").trim();
    if (!ticket) return null;
    const ticketHash = hashRingtoneDownloadTicket(ticket);
    const nowIso = new Date().toISOString();

    const supabase = getSupabaseServerClient();
    const consumed = await supabase
        .from("ringtone_download_tickets")
        .update({ consumed_at: nowIso })
        .eq("ticket_hash", ticketHash)
        .is("consumed_at", null)
        .gt("expires_at", nowIso)
        .select("ticket_hash,user_id,ringtone_id,purchase_id,storage_path,filename,content_type,expires_at,consumed_at")
        .maybeSingle();

    if (!consumed.error && consumed.data) {
        return {
            ticketHash: String(consumed.data.ticket_hash),
            userId: String(consumed.data.user_id),
            ringtoneId: String(consumed.data.ringtone_id),
            purchaseId: consumed.data.purchase_id ? String(consumed.data.purchase_id) : null,
            storagePath: String(consumed.data.storage_path),
            filename: String(consumed.data.filename),
            contentType: String(consumed.data.content_type),
            expiresAt: String(consumed.data.expires_at),
            consumedAt: consumed.data.consumed_at ? String(consumed.data.consumed_at) : nowIso,
        } satisfies RingtoneDownloadTicketRecord;
    }

    if (consumed.error && !isMissingTableError(consumed.error)) {
        throw new Error(getErrorMessage(consumed.error) || "Unable to validate download ticket.");
    }

    // Memory fallback path (and expired/replay checks for that store).
    const memory = memoryStore().get(ticketHash);
    if (!memory) return null;
    if (memory.consumedAt) return null;
    if (Date.parse(memory.expiresAt) <= Date.now()) return null;
    const next = { ...memory, consumedAt: nowIso };
    memoryStore().set(ticketHash, next);
    return next;
}

/** Test helper: peek memory ticket state without consuming. */
export function peekMemoryRingtoneDownloadTicket(rawTicket: string) {
    return memoryStore().get(hashRingtoneDownloadTicket(rawTicket)) || null;
}
