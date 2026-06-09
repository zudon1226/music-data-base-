import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SONGS_BUCKET = "songs";
const VIDEOS_BUCKET = "videos";
const MAX_DELETE_PER_BUCKET = 100;

type RawStorageFile = {
  bucket: string;
  path: string;
  fileName: string;
  size: number;
  updatedAt: string;
};

type CleanupFileStatus = "Already linked" | "Possible duplicate";

type StorageFile = RawStorageFile & {
  status: CleanupFileStatus;
  reason: string;
  deletable: boolean;
  matchedBy: string[];
  linkedSources: string[];
  matchedItems: {
    itemType: "song" | "video" | "album";
    itemId: string;
    title: string;
    source: string;
  }[];
};

type BrokenMedia = {
  id: string;
  title: string;
  itemType: "song" | "video";
  bucket: string;
  storagePath: string;
  reason: string;
};

type AlbumItemIssue = {
  albumId: string;
  albumTitle: string;
  itemId: string;
  itemType: string;
  reason: string;
};

type MediaReference = {
  itemType: "song" | "video" | "album";
  itemId: string;
  title: string;
  source: string;
  paths: Set<string>;
  fileNames: Set<string>;
  sizes: Set<number>;
  urls: string[];
  linkedSources: Set<string>;
};

type DeleteLogRow = {
  deletedAt: string;
  userId: string;
  bucket: string;
  path: string;
  fileName: string;
  size: number;
  statusBeforeDelete: CleanupFileStatus;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message || record.error || JSON.stringify(record));
  }
  return "Unknown server error";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isMissingTable(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
  if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing or still set to the placeholder value.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizePath(value: string) {
  return decodeURIComponent(value.split("?")[0].replace(/^\/+/, ""));
}

function getFileName(value: string) {
  const normalized = normalizePath(value);
  return normalized.split("/").filter(Boolean).pop()?.toLowerCase() || "";
}

function extractStoragePath(value: unknown, bucket: string) {
  if (typeof value !== "string" || !value) return "";
  const marker = `/object/public/${bucket}/`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex !== -1) {
    return normalizePath(value.slice(markerIndex + marker.length));
  }
  if (value.startsWith(`${bucket}/`)) return normalizePath(value.slice(bucket.length + 1));
  if (!value.includes("://") && getFileName(value)) return normalizePath(value);
  return "";
}

function getNumberValue(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function makeItemKey(itemType: string, itemId: string) {
  return `${itemType}:${itemId}`;
}

function pushUnique(list: string[], value: string) {
  if (value && !list.includes(value)) list.push(value);
}

async function listStorageFiles(supabase: ReturnType<typeof getSupabaseServerClient>, bucket: string, prefix = ""): Promise<RawStorageFile[]> {
  const files: RawStorageFile[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) throw error;

    const entries = data || [];
    for (const entry of entries) {
      const nextPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const size = Number(entry.metadata?.size || 0);
      const isFolder = !entry.id && !size && !entry.metadata?.mimetype;
      if (isFolder) {
        files.push(...await listStorageFiles(supabase, bucket, nextPath));
      } else {
        files.push({
          bucket,
          path: nextPath,
          fileName: entry.name.toLowerCase(),
          size,
          updatedAt: String(entry.updated_at || entry.created_at || ""),
        });
      }
    }

    if (entries.length < 1000) break;
    offset += entries.length;
  }

  return files;
}

async function safeSelect<T extends Record<string, unknown>>(query: PromiseLike<{ data: T[] | null; error: unknown }>) {
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data || [];
}

function buildLinkedItemSets(
  librarySaves: Record<string, unknown>[],
  playlistItems: Record<string, unknown>[],
  playlistSongs: Record<string, unknown>[],
  recentPlays: Record<string, unknown>[],
  albumItems: Record<string, unknown>[],
) {
  const library = new Set<string>();
  const playlist = new Set<string>();
  const recent = new Set<string>();
  const album = new Set<string>();

  for (const row of librarySaves) {
    const itemType = String(row.item_type || "");
    const itemId = String(row.item_id || row.song_id || row.video_id || row.album_id || "");
    if (itemType && itemId) library.add(makeItemKey(itemType, itemId));
  }

  for (const row of playlistItems) {
    const itemType = String(row.item_type || "");
    const itemId = String(row.item_id || row.song_id || row.video_id || row.album_id || "");
    if (itemType && itemId) playlist.add(makeItemKey(itemType, itemId));
  }

  for (const row of playlistSongs) {
    const songId = String(row.song_id || row.item_id || "");
    if (songId) playlist.add(makeItemKey("song", songId));
  }

  for (const row of recentPlays) {
    const itemType = String(row.item_type || "");
    const itemId = String(row.item_id || row.song_id || row.video_id || row.album_id || "");
    if (itemType && itemId) recent.add(makeItemKey(itemType, itemId));
    if (row.song_id) recent.add(makeItemKey("song", String(row.song_id)));
    if (row.video_id) recent.add(makeItemKey("video", String(row.video_id)));
    if (row.album_id) recent.add(makeItemKey("album", String(row.album_id)));
  }

  for (const row of albumItems) {
    const itemType = String(row.item_type || "");
    const itemId = String(row.item_id || "");
    if (itemType && itemId) album.add(makeItemKey(itemType, itemId));
  }

  return { library, playlist, recent, album };
}

function collectMediaReference(
  row: Record<string, unknown>,
  itemType: "song" | "video" | "album",
  source: string,
  bucket: string,
  linkedSets: ReturnType<typeof buildLinkedItemSets>,
) {
  const itemId = String(row.id || "");
  if (!itemId) return null;

  const title = String(row.title || row.name || `Untitled ${itemType}`);
  const reference: MediaReference = {
    itemType,
    itemId,
    title,
    source,
    paths: new Set<string>(),
    fileNames: new Set<string>(),
    sizes: new Set<number>(),
    urls: [],
    linkedSources: new Set<string>([source]),
  };

  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && value) {
      const path = extractStoragePath(value, bucket);
      if (path) {
        reference.paths.add(path);
        reference.fileNames.add(getFileName(path));
      }

      if (value.includes(`/object/public/${bucket}/`)) {
        reference.urls.push(value);
        reference.fileNames.add(getFileName(value));
      }

      const lowerKey = key.toLowerCase();
      if ((lowerKey.includes("path") || lowerKey.includes("file")) && getFileName(value)) {
        reference.fileNames.add(getFileName(value));
      }
    }

    const lowerKey = key.toLowerCase();
    if (lowerKey.includes("size") || lowerKey.includes("bytes")) {
      const size = getNumberValue(value);
      if (size) reference.sizes.add(size);
    }
  }

  const itemKey = makeItemKey(itemType, itemId);
  if (linkedSets.library.has(itemKey)) reference.linkedSources.add("Library");
  if (linkedSets.playlist.has(itemKey)) reference.linkedSources.add("Playlist");
  if (linkedSets.recent.has(itemKey)) reference.linkedSources.add("Recent upload");
  if (linkedSets.album.has(itemKey)) reference.linkedSources.add("Album item");
  if (row.user_id || row.artist_id || row.producer_id || row.producer_profile_id) reference.linkedSources.add("Recent upload");

  return reference;
}

function matchStorageFile(file: RawStorageFile, references: MediaReference[]) {
  const matchedBy: string[] = [];
  const linkedSources: string[] = [];
  const matchedItems: StorageFile["matchedItems"] = [];
  const fileName = file.fileName || getFileName(file.path);

  for (const reference of references) {
    const referenceMatchedBy: string[] = [];
    const exactPathMatch = reference.paths.has(file.path);
    const urlMatch = reference.urls.some((url) => extractStoragePath(url, file.bucket) === file.path);
    const fileNameMatch = Boolean(fileName && reference.fileNames.has(fileName));
    const sizeMatch = file.size > 0 && reference.sizes.has(file.size);

    if (exactPathMatch) referenceMatchedBy.push("storage path");
    if (urlMatch) referenceMatchedBy.push("matching URL");
    if (fileNameMatch) referenceMatchedBy.push("file name");
    if (sizeMatch) referenceMatchedBy.push("size");

    const isStrongMatch = exactPathMatch || urlMatch || (fileNameMatch && sizeMatch);
    const isLinkedDuplicate = fileNameMatch && reference.linkedSources.size > 1;
    if (!isStrongMatch && !isLinkedDuplicate) continue;

    for (const match of referenceMatchedBy) pushUnique(matchedBy, match);
    for (const source of reference.linkedSources) pushUnique(linkedSources, source);
    matchedItems.push({
      itemType: reference.itemType,
      itemId: reference.itemId,
      title: reference.title,
      source: reference.source,
    });
  }

  const isAlreadyLinked = matchedItems.length > 0;
  return {
    ...file,
    status: isAlreadyLinked ? "Already linked" as const : "Possible duplicate" as const,
    reason: isAlreadyLinked
      ? `Already linked by ${matchedBy.join(", ") || "library, playlist, album, or upload record"}`
      : "No matching song, video, album, library, playlist, or recent upload record found.",
    deletable: !isAlreadyLinked,
    matchedBy,
    linkedSources,
    matchedItems,
  };
}

async function buildStorageReport() {
  const supabase = getSupabaseServerClient();
  const [
    songs,
    videos,
    albums,
    albumItems,
    librarySaves,
    playlistItems,
    playlistSongs,
    recentPlays,
    songFiles,
    videoFiles,
  ] = await Promise.all([
    safeSelect<Record<string, unknown>>(supabase.from("songs").select("*")),
    safeSelect<Record<string, unknown>>(supabase.from("videos").select("*")),
    safeSelect<Record<string, unknown>>(supabase.from("albums").select("*")),
    safeSelect<Record<string, unknown>>(supabase.from("album_items").select("*")),
    safeSelect<Record<string, unknown>>(supabase.from("library_saves").select("*")),
    safeSelect<Record<string, unknown>>(supabase.from("playlist_items").select("*")),
    safeSelect<Record<string, unknown>>(supabase.from("playlist_songs").select("*")),
    safeSelect<Record<string, unknown>>(supabase.from("recent_plays").select("*")),
    listStorageFiles(supabase, SONGS_BUCKET).catch((error) => {
      console.error("[api/platform/storage-cleanup] songs bucket scan failed:", error);
      return [] as RawStorageFile[];
    }),
    listStorageFiles(supabase, VIDEOS_BUCKET).catch((error) => {
      console.error("[api/platform/storage-cleanup] videos bucket scan failed:", error);
      return [] as RawStorageFile[];
    }),
  ]);

  const linkedSets = buildLinkedItemSets(librarySaves, playlistItems, playlistSongs, recentPlays, albumItems);
  const references = [
    ...songs.flatMap((song) => [collectMediaReference(song, "song", "Song upload", SONGS_BUCKET, linkedSets), collectMediaReference(song, "song", "Song cover/video reference", VIDEOS_BUCKET, linkedSets)]),
    ...videos.flatMap((video) => [collectMediaReference(video, "video", "Video upload", VIDEOS_BUCKET, linkedSets), collectMediaReference(video, "video", "Video audio/reference", SONGS_BUCKET, linkedSets)]),
    ...albums.flatMap((album) => [collectMediaReference(album, "album", "Album artwork", SONGS_BUCKET, linkedSets), collectMediaReference(album, "album", "Album artwork", VIDEOS_BUCKET, linkedSets)]),
  ].filter((reference): reference is MediaReference => Boolean(reference));

  const songFileSet = new Set(songFiles.map((file) => file.path));
  const videoFileSet = new Set(videoFiles.map((file) => file.path));
  const brokenMedia: BrokenMedia[] = [];

  for (const song of songs) {
    const storagePath = String(song.storage_path || "") || extractStoragePath(song.audio_url, SONGS_BUCKET);
    if (!storagePath) {
      brokenMedia.push({
        id: String(song.id || ""),
        title: String(song.title || "Untitled song"),
        itemType: "song",
        bucket: SONGS_BUCKET,
        storagePath: "",
        reason: "Missing storage path",
      });
    } else if (!songFileSet.has(storagePath)) {
      brokenMedia.push({
        id: String(song.id || ""),
        title: String(song.title || "Untitled song"),
        itemType: "song",
        bucket: SONGS_BUCKET,
        storagePath,
        reason: "Database song points to a missing storage file",
      });
    }
  }

  for (const video of videos) {
    const storagePath = String(video.storage_path || "") || extractStoragePath(video.video_url, VIDEOS_BUCKET);
    if (!storagePath) {
      brokenMedia.push({
        id: String(video.id || ""),
        title: String(video.title || "Untitled video"),
        itemType: "video",
        bucket: VIDEOS_BUCKET,
        storagePath: "",
        reason: "Missing storage path",
      });
    } else if (!videoFileSet.has(storagePath)) {
      brokenMedia.push({
        id: String(video.id || ""),
        title: String(video.title || "Untitled video"),
        itemType: "video",
        bucket: VIDEOS_BUCKET,
        storagePath,
        reason: "Database video points to a missing storage file",
      });
    }
  }

  const cleanupCandidates = [...songFiles, ...videoFiles].map((file) => matchStorageFile(file, references));
  const albumMap = new Map(albums.map((album) => [String(album.id || ""), album]));
  const songIds = new Set(songs.map((song) => String(song.id || "")));
  const videoIds = new Set(videos.map((video) => String(video.id || "")));
  const albumItemIssues: AlbumItemIssue[] = [];
  const albumItemCounts = new Map<string, number>();

  for (const item of albumItems) {
    const albumId = String(item.album_id || "");
    const itemId = String(item.item_id || "");
    const itemType = String(item.item_type || "");
    const album = albumMap.get(albumId);
    albumItemCounts.set(albumId, (albumItemCounts.get(albumId) || 0) + 1);

    if (!album) {
      albumItemIssues.push({ albumId, albumTitle: "Missing album", itemId, itemType, reason: "Album item points to a missing album" });
      continue;
    }

    if (itemType === "song" && !songIds.has(itemId)) {
      albumItemIssues.push({ albumId, albumTitle: String(album.title || "Untitled album"), itemId, itemType, reason: "Album item points to a missing song" });
    }

    if (itemType === "video" && !videoIds.has(itemId)) {
      albumItemIssues.push({ albumId, albumTitle: String(album.title || "Untitled album"), itemId, itemType, reason: "Album item points to a missing video" });
    }
  }

  for (const album of albums) {
    const albumId = String(album.id || "");
    if (!albumItemCounts.get(albumId)) {
      albumItemIssues.push({
        albumId,
        albumTitle: String(album.title || "Untitled album"),
        itemId: "",
        itemType: "album",
        reason: "Album has no linked songs or videos",
      });
    }
  }

  const deletableCandidates = cleanupCandidates.filter((file) => file.deletable);
  const protectedFiles = cleanupCandidates.filter((file) => !file.deletable);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      songs: songs.length,
      videos: videos.length,
      albums: albums.length,
      storageFiles: songFiles.length + videoFiles.length,
      brokenMedia: brokenMedia.length,
      orphanStorageFiles: cleanupCandidates.length,
      possibleDuplicates: deletableCandidates.length,
      alreadyLinkedStorageFiles: protectedFiles.length,
      missingAlbumItems: albumItemIssues.length,
    },
    brokenMedia,
    orphanStorageFiles: cleanupCandidates,
    missingAlbumItems: albumItemIssues,
  };
}

export async function GET() {
  try {
    return jsonResponse(await buildStorageReport());
  } catch (error) {
    console.error("[api/platform/storage-cleanup] scan failed:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const selectedFiles = Array.isArray(body.files) ? body.files : [];
    const confirmText = typeof body.confirm === "string" ? body.confirm.trim() : "";

    if (!userId || !isUuid(userId)) {
      return jsonResponse({ error: "Log in before deleting selected storage files." }, 401);
    }

    if (confirmText !== "Confirm Delete Selected") {
      return jsonResponse({ error: "Confirm Delete Selected is required before deleting storage files." }, 400);
    }

    const selectedKeys = new Set(
      selectedFiles
        .map((file) => {
          if (!file || typeof file !== "object") return "";
          const record = file as Record<string, unknown>;
          const bucket = typeof record.bucket === "string" ? record.bucket : "";
          const path = typeof record.path === "string" ? record.path : "";
          return bucket && path ? `${bucket}:${path}` : "";
        })
        .filter(Boolean),
    );

    if (selectedKeys.size === 0) {
      return jsonResponse({ error: "Choose at least one storage file before confirming delete." }, 400);
    }

    const supabase = getSupabaseServerClient();
    const report = await buildStorageReport();
    const deletableSelected = report.orphanStorageFiles.filter((file) => selectedKeys.has(`${file.bucket}:${file.path}`) && file.deletable && file.status !== "Already linked");
    const protectedSelected = report.orphanStorageFiles.filter((file) => selectedKeys.has(`${file.bucket}:${file.path}`) && (!file.deletable || file.status === "Already linked"));

    if (deletableSelected.length === 0) {
      return jsonResponse({
        error: "No selected files are eligible for deletion. Already linked files are protected.",
        protected: protectedSelected,
      }, 400);
    }

    const byBucket = new Map<string, string[]>();
    for (const file of deletableSelected) {
      const paths = byBucket.get(file.bucket) || [];
      if (paths.length < MAX_DELETE_PER_BUCKET) {
        paths.push(file.path);
        byBucket.set(file.bucket, paths);
      }
    }

    const deleted: StorageFile[] = [];
    const deletedLog: DeleteLogRow[] = [];
    const failures: Record<string, string> = {};
    const deletedAt = new Date().toISOString();

    for (const [bucket, paths] of byBucket) {
      if (paths.length === 0) continue;
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) {
        failures[bucket] = getErrorMessage(error);
        continue;
      }

      const bucketDeleted = deletableSelected.filter((file) => file.bucket === bucket && paths.includes(file.path));
      deleted.push(...bucketDeleted);
      deletedLog.push(...bucketDeleted.map((file) => ({
        deletedAt,
        userId,
        bucket: file.bucket,
        path: file.path,
        fileName: file.fileName,
        size: file.size,
        statusBeforeDelete: file.status,
      })));
    }

    if (deletedLog.length > 0) {
      const logRows = deletedLog.map((row) => ({
        deleted_by: row.userId,
        bucket_name: row.bucket,
        file_path: row.path,
        file_name: row.fileName,
        file_size: row.size,
        status_before_delete: row.statusBeforeDelete,
        reason: "Confirmed storage cleanup delete",
      }));
      const logResult = await supabase.from("storage_cleanup_delete_logs").insert(logRows);
      if (logResult.error) {
        const message = getErrorMessage(logResult.error).toLowerCase();
        if (!message.includes("does not exist") && !message.includes("schema cache")) {
          console.warn("[api/platform/storage-cleanup] delete log skipped:", logResult.error);
        }
      }
    }

    return jsonResponse({
      ok: Object.keys(failures).length === 0,
      deleted,
      deletedLog,
      protected: protectedSelected,
      failures,
      remainingCandidates: Math.max(0, report.orphanStorageFiles.filter((file) => file.deletable).length - deleted.length),
    });
  } catch (error) {
    console.error("[api/platform/storage-cleanup] selected delete failed:", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
}
