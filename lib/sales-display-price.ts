/**
 * Listener-facing catalog price labels (display only).
 * Checkout still resolves authoritative prices in lib/sales-catalog.ts.
 */

export function readCatalogPriceCents(record: Record<string, unknown> | null | undefined): number {
    if (!record || typeof record !== "object") return 0;
    const raw = record.price_cents ?? record.priceCents;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.round(numeric));
}

export function resolveSongDisplayPriceCents(song: { priceCents?: number; price_cents?: number } | Record<string, unknown>): number {
    if ("priceCents" in song && song.priceCents != null) {
        return Math.max(0, Math.round(Number(song.priceCents)));
    }
    return readCatalogPriceCents(song as Record<string, unknown>);
}

export function resolveAlbumDisplayPriceCents(album: { priceCents?: number; price_cents?: number } | Record<string, unknown>): number {
    return resolveSongDisplayPriceCents(album);
}

export function resolveBeatLeasePriceCents(beat: {
    license?: string;
    leasePrice?: number;
    exclusivePrice?: number;
}): number {
    if (beat.license === "Free") return 0;
    if (beat.license === "Exclusive") {
        return Math.max(0, Math.round(Number(beat.exclusivePrice || 0) * 100));
    }
    return Math.max(0, Math.round(Number(beat.leasePrice || 0) * 100));
}

export function formatCatalogPriceLabel(priceCents: number, formatCents: (cents: number) => string): string {
    const cents = Math.max(0, Math.round(Number(priceCents) || 0));
    if (cents <= 0) return "Free";
    return formatCents(cents);
}

export function formatBeatLicensePriceHint(
    beat: { license?: string; leasePrice?: number; exclusivePrice?: number },
    formatCents: (cents: number) => string,
): string {
    if (beat.license === "Free") return "Free beat";
    const leaseCents = Math.max(0, Math.round(Number(beat.leasePrice || 0) * 100));
    const exclusiveCents = Math.max(0, Math.round(Number(beat.exclusivePrice || 0) * 100));
    const parts: string[] = [];
    if (leaseCents > 0) parts.push(`Lease ${formatCents(leaseCents)}`);
    if (exclusiveCents > 0) parts.push(`Exclusive ${formatCents(exclusiveCents)}`);
    if (!parts.length) return "Free beat";
    return parts.join(" · ");
}