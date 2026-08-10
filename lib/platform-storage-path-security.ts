/** Approved media storage buckets for PCC cleanup/delete. */
export const PLATFORM_CLEANUP_ALLOWED_BUCKETS = ["songs", "videos"] as const;

export type PlatformCleanupAllowedBucket = (typeof PLATFORM_CLEANUP_ALLOWED_BUCKETS)[number];

export function normalizePlatformStoragePath(value: string) {
  return decodeURIComponent(String(value || "").split("?")[0].replace(/^\/+/, ""));
}

/**
 * Reject path traversal, absolute URLs, and anything outside a relative object key.
 */
export function isSafePlatformStoragePath(path: string) {
  const normalized = normalizePlatformStoragePath(path);
  if (!normalized) return false;
  if (normalized.includes("\0")) return false;
  if (normalized.includes("\\")) return false;
  if (normalized.includes("://")) return false;
  if (normalized.startsWith("/") || normalized.startsWith("~")) return false;
  if (normalized.split("/").some((segment) => segment === "." || segment === "..")) return false;
  if (normalized.includes("//")) return false;
  return true;
}

export function isAllowedPlatformCleanupBucket(bucket: string): bucket is PlatformCleanupAllowedBucket {
  return (PLATFORM_CLEANUP_ALLOWED_BUCKETS as readonly string[]).includes(String(bucket || "").trim());
}

export function sanitizePlatformCleanupFileSelection(
  files: unknown[],
): { bucket: PlatformCleanupAllowedBucket; path: string }[] {
  const selected: { bucket: PlatformCleanupAllowedBucket; path: string }[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (!file || typeof file !== "object") continue;
    const record = file as Record<string, unknown>;
    const bucket = typeof record.bucket === "string" ? record.bucket.trim() : "";
    const path = typeof record.path === "string" ? normalizePlatformStoragePath(record.path.trim()) : "";
    if (!isAllowedPlatformCleanupBucket(bucket)) continue;
    if (!isSafePlatformStoragePath(path)) continue;
    const key = `${bucket}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ bucket, path });
  }

  return selected;
}
