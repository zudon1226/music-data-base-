/**
 * Authoritative sales catalog resolution for songs / albums / beats.
 * Prices, titles, creators, and download paths come from the database — never the client.
 */

import { getErrorMessage, getSupabaseServerClient, isUuid } from "@/lib/server-supabase";

export const SALES_LICENSE_TYPES = new Set(["Basic", "Premium", "Unlimited", "Exclusive"]);

export type SalesItemType = "song" | "album" | "beat";
export type SalesLicenseType = "Basic" | "Premium" | "Unlimited" | "Exclusive";

export type ResolvedSalesCatalogItem = {
  itemId: string;
  itemType: SalesItemType;
  title: string;
  creatorName: string;
  creatorId: string;
  coverUrl: string;
  downloadUrl: string;
  priceCents: number;
  currency: string;
  licenseType: string;
  licenseTerms: string[];
  isFree: boolean;
};

function dollarsToCents(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.max(0, Math.round(numeric * 100));
}

export function normalizeSalesItemType(value: unknown): SalesItemType | "" {
  if (value === "album" || value === "beat" || value === "song") return value;
  return "";
}

export function normalizeSalesLicenseType(value: unknown): SalesLicenseType | "" {
  const licenseType = String(value || "").trim();
  return SALES_LICENSE_TYPES.has(licenseType) ? (licenseType as SalesLicenseType) : "";
}

function beatPriceCents(row: Record<string, unknown>, licenseType: SalesLicenseType | "") {
  const licenseMode = String(row.license || "").trim();
  if (licenseMode === "Free") return 0;
  if (licenseType === "Exclusive" || licenseMode === "Exclusive") {
    return dollarsToCents(row.exclusive_price);
  }
  return dollarsToCents(row.lease_price);
}

function defaultBeatLicenseTerms(licenseType: SalesLicenseType | "", producerName: string) {
  const creditLine = `Credit required: produced by ${producerName || "the producer"}.`;
  if (licenseType === "Exclusive") {
    return [
      "Exclusive license transfers exclusive commercial rights for this beat to the buyer.",
      "Producer may no longer license this beat to other buyers after exclusive sale.",
      creditLine,
    ];
  }
  return [
    "Non-exclusive license for demos, streaming, and limited commercial release.",
    "Beat ownership remains with the producer.",
    creditLine,
  ];
}

/**
 * Resolve one cart/checkout line from authoritative catalog tables.
 * Client price / creator / download URL / terms are ignored.
 */
export async function resolveSalesCatalogItem(input: {
  itemId: string;
  itemType: unknown;
  licenseType?: unknown;
}): Promise<{ ok: true; item: ResolvedSalesCatalogItem } | { ok: false; status: number; error: string }> {
  const itemType = normalizeSalesItemType(input.itemType);
  const itemId = String(input.itemId || "").trim();
  if (!itemType) {
    return { ok: false, status: 400, error: "Sales item_type must be song, album, or beat." };
  }
  if (!itemId) {
    return { ok: false, status: 400, error: "Sales item requires an item id." };
  }

  const supabase = getSupabaseServerClient();

  if (itemType === "song") {
    if (!isUuid(itemId)) return { ok: false, status: 400, error: "Invalid song id." };
    const { data, error } = await supabase
      .from("songs")
      .select("id,title,artist,user_id,cover_url,audio_url,storage_path,price_cents")
      .eq("id", itemId)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: getErrorMessage(error) };
    if (!data) return { ok: false, status: 404, error: "Song not found." };
    const priceCents = Math.max(0, Math.round(Number(data.price_cents) || 0));
    return {
      ok: true,
      item: {
        itemId: String(data.id),
        itemType: "song",
        title: String(data.title || "Untitled"),
        creatorName: String(data.artist || ""),
        creatorId: String(data.user_id || ""),
        coverUrl: String(data.cover_url || ""),
        downloadUrl: String(data.audio_url || data.storage_path || ""),
        priceCents,
        currency: "USD",
        licenseType: "",
        licenseTerms: [],
        isFree: priceCents === 0,
      },
    };
  }

  if (itemType === "album") {
    if (!isUuid(itemId)) return { ok: false, status: 400, error: "Invalid album id." };
    const { data, error } = await supabase
      .from("albums")
      .select("id,title,creator_name,artist_name,user_id,cover_url,price_cents")
      .eq("id", itemId)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: getErrorMessage(error) };
    if (!data) return { ok: false, status: 404, error: "Album not found." };
    const priceCents = Math.max(0, Math.round(Number(data.price_cents) || 0));
    return {
      ok: true,
      item: {
        itemId: String(data.id),
        itemType: "album",
        title: String(data.title || "Untitled"),
        creatorName: String(data.creator_name || data.artist_name || ""),
        creatorId: String(data.user_id || ""),
        coverUrl: String(data.cover_url || ""),
        downloadUrl: "",
        priceCents,
        currency: "USD",
        licenseType: "",
        licenseTerms: [],
        isFree: priceCents === 0,
      },
    };
  }

  // beat
  const licenseType = normalizeSalesLicenseType(input.licenseType);
  if (!licenseType) {
    return { ok: false, status: 400, error: "Beat sales require a valid license type." };
  }
  if (!isUuid(itemId)) return { ok: false, status: 400, error: "Invalid beat id." };
  const { data, error } = await supabase
    .from("producer_beats")
    .select("id,title,producer_name,producer_user_id,cover_url,audio_url,storage_path,license,lease_price,exclusive_price")
    .eq("id", itemId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: getErrorMessage(error) };
  if (!data) return { ok: false, status: 404, error: "Beat not found." };
  const priceCents = beatPriceCents(data as Record<string, unknown>, licenseType);
  const producerName = String(data.producer_name || "");
  return {
    ok: true,
    item: {
      itemId: String(data.id),
      itemType: "beat",
      title: String(data.title || "Untitled"),
      creatorName: producerName,
      creatorId: String(data.producer_user_id || ""),
      coverUrl: String(data.cover_url || ""),
      downloadUrl: String(data.audio_url || data.storage_path || ""),
      priceCents,
      currency: "USD",
      licenseType,
      licenseTerms: defaultBeatLicenseTerms(licenseType, producerName),
      isFree: priceCents === 0,
    },
  };
}

export function catalogItemToSalesRow(userId: string, item: ResolvedSalesCatalogItem) {
  return {
    user_id: userId,
    item_id: item.itemId,
    item_type: item.itemType,
    title: item.title,
    creator_name: item.creatorName,
    cover_url: item.coverUrl,
    download_url: item.downloadUrl,
    price_cents: item.priceCents,
    currency: item.currency,
    license_type: item.licenseType,
    license_terms: item.licenseTerms,
    license_id: "",
    license_pdf_file_name: item.itemType === "beat" && item.licenseType
      ? `${item.title || "beat"}-${item.licenseType}.pdf`
      : "",
  };
}
