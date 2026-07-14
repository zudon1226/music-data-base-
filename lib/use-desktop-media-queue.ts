"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    clearInMemoryMediaQueue,
    clearMediaQueueItems,
    clampQueueActiveIndex,
    dequeueMedia,
    emptyMediaQueue,
    enqueueMedia,
    getUpNextMediaItems,
    isInMediaQueue,
    isMediaQueueItem,
    mediaQueueItemKey,
    moveMediaQueueItem,
    moveMediaQueueItemTo,
    normalizeSongToQueueItem,
    normalizeVideoToQueueItem,
    replaceMediaQueue,
    selectNextQueueItem,
    selectPreviousQueueItem,
    selectQueueItem,
    uniqueMediaQueueItems,
    type MediaQueueItem,
    type MediaQueueState,
    type MediaQueueType,
} from "@/lib/desktop-media-queue";

export const MEDIA_QUEUE_STORAGE_PREFIX = "music-data-base:media-queue:";

const LEGACY_QUEUE_STORAGE_KEYS = [
    "zml_queue",
    "zmusic-queue",
    "z-music-v14-queue",
    "zmusic-v40-queue",
] as const;

type StoredQueuePayload = {
    userId: string;
    items: MediaQueueItem[];
    activeIndex: number;
    updatedAt?: string;
};

/** Temporary — always log in production so browser verification works. */
function persistDebug(...args: unknown[]) {
    console.info("[media-queue:persist]", ...args);
}

export function getMediaQueueStorageKey(userId: string) {
    return `${MEDIA_QUEUE_STORAGE_PREFIX}${String(userId || "").trim()}`;
}

function removeLegacyQueueKeys() {
    if (typeof window === "undefined") return;
    for (const key of LEGACY_QUEUE_STORAGE_KEYS) {
        try {
            if (window.localStorage.getItem(key) != null) {
                persistDebug("localStorage.removeItem", key, "reason=legacy-cleanup");
            }
            window.localStorage.removeItem(key);
        }
        catch {
            // ignore
        }
    }
}

function reviveStoredQueueItem(value: unknown): MediaQueueItem | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const mediaType = String(record.mediaType || "").trim();
    if (mediaType === "video") {
        return normalizeVideoToQueueItem(record).item;
    }
    if (mediaType === "song") {
        return normalizeSongToQueueItem(record).item;
    }
    return isMediaQueueItem(value) ? value : null;
}

function readStoredQueue(userId: string): StoredQueuePayload {
    const key = getMediaQueueStorageKey(userId);
    if (typeof window === "undefined") {
        return { userId, items: [], activeIndex: -1 };
    }
    try {
        const raw = window.localStorage.getItem(key);
        persistDebug("localStorage.getItem", key, "rawLength=", raw ? raw.length : 0);
        if (!raw) {
            return { userId, items: [], activeIndex: -1 };
        }
        const parsed = JSON.parse(raw) as Partial<StoredQueuePayload>;
        const revived = (Array.isArray(parsed.items) ? parsed.items : [])
            .map((item) => reviveStoredQueueItem(item))
            .filter((item): item is MediaQueueItem => item != null);
        const items = uniqueMediaQueueItems(revived);
        return {
            userId,
            items,
            activeIndex: clampQueueActiveIndex(items, Number(parsed.activeIndex)),
            updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
        };
    }
    catch (error) {
        console.warn("[media-queue:persist] failed to parse stored queue", error);
        return { userId, items: [], activeIndex: -1 };
    }
}

function storedPayloadHasItems(userId: string) {
    if (typeof window === "undefined") return false;
    try {
        const raw = window.localStorage.getItem(getMediaQueueStorageKey(userId));
        if (!raw) return false;
        const parsed = JSON.parse(raw) as Partial<StoredQueuePayload>;
        return Array.isArray(parsed.items) && parsed.items.length > 0;
    }
    catch {
        return false;
    }
}

function writeStoredQueue(
    userId: string,
    items: MediaQueueItem[],
    activeIndex: number,
    options: { allowEmpty?: boolean; reason?: string } = {},
) {
    if (typeof window === "undefined") {
        persistDebug("writeStoredQueue skipped — window undefined", options.reason);
        return false;
    }
    const key = getMediaQueueStorageKey(userId);
    const nextItems = uniqueMediaQueueItems(items);
    if (nextItems.length === 0 && !options.allowEmpty && storedPayloadHasItems(userId)) {
        persistDebug("writeStoredQueue REFUSED empty overwrite", { key, reason: options.reason });
        return false;
    }
    const payload: StoredQueuePayload = {
        userId,
        items: nextItems,
        activeIndex: clampQueueActiveIndex(nextItems, activeIndex),
        updatedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(payload);
    persistDebug("localStorage.setItem", key, "itemCount=", payload.items.length, "reason=", options.reason || "");
    window.localStorage.setItem(key, serialized);
    persistDebug("localStorage.setItem DONE — verify key present=", window.localStorage.getItem(key) != null);
    return true;
}

function queueSnapshot(userId: string, items: MediaQueueItem[], activeIndex: number) {
    return JSON.stringify({
        userId,
        items: uniqueMediaQueueItems(items),
        activeIndex: clampQueueActiveIndex(items, activeIndex),
    });
}

/**
 * ONE canonical mixed-media queue.
 * Key: music-data-base:media-queue:<user-id>
 *
 * ROOT CAUSE of missing localStorage writes:
 * Persistence was gated on state.queueHydrated / hydrationCompleteRef, which are only
 * set by useLayoutEffect. If that effect never completes (or resetQueueOnLogout clears
 * those flags without the effect re-running because accountUserId/authResolved deps
 * did not change), commit() skips persist forever while in-memory enqueue still works.
 */
export function useDesktopMediaQueue(options: {
    accountUserId: string;
    authResolved: boolean;
    authenticatedFetch?: unknown;
}) {
    const { accountUserId, authResolved } = options;
    const [state, setState] = useState<MediaQueueState>(() => emptyMediaQueue());
    const stateRef = useRef(state);
    stateRef.current = state;

    const hydrationCompleteRef = useRef(false);
    const hydratedUserIdRef = useRef("");
    const lastPersistedSnapshotRef = useRef("");
    const hydrateGenerationRef = useRef(0);
    const allowEmptyPersistRef = useRef(false);
    const accountUserIdRef = useRef(accountUserId);
    accountUserIdRef.current = accountUserId;

    /**
     * Synchronous hydrate using the live accountUserId.
     * Must run before any persist so queueHydrated cannot stay false forever.
     */
    const ensureHydrated = useCallback((reason: string) => {
        const userId = String(accountUserIdRef.current || "").trim();
        if (!userId) {
            persistDebug("ensureHydrated skipped — no userId", reason);
            return "";
        }
        if (hydrationCompleteRef.current && hydratedUserIdRef.current === userId && stateRef.current.queueHydrated) {
            return userId;
        }

        const generation = ++hydrateGenerationRef.current;
        removeLegacyQueueKeys();
        const key = getMediaQueueStorageKey(userId);
        persistDebug("ensureHydrated start", { userId, key, reason });

        const stored = readStoredQueue(userId);
        if (hydrateGenerationRef.current !== generation) {
            persistDebug("ensureHydrated aborted — generation changed", reason);
            return "";
        }

        const memoryItems = uniqueMediaQueueItems(stateRef.current.items);
        // Keep any in-memory items that were enqueued before hydrate finished.
        const mergedItems = uniqueMediaQueueItems([...stored.items, ...memoryItems]);
        const activeIndex = memoryItems.length > 0 && stored.items.length === 0
            ? clampQueueActiveIndex(mergedItems, stateRef.current.activeIndex)
            : clampQueueActiveIndex(mergedItems, stored.activeIndex);

        const nextState: MediaQueueState = {
            userId,
            items: mergedItems,
            activeIndex,
            authResolved: true,
            queueHydrated: true,
            isLoadingQueue: false,
            isSavingQueue: false,
        };

        stateRef.current = nextState;
        hydrationCompleteRef.current = true;
        hydratedUserIdRef.current = userId;
        // Snapshot storage-only so merged memory items still trigger a write.
        lastPersistedSnapshotRef.current = queueSnapshot(userId, stored.items, stored.activeIndex);
        allowEmptyPersistRef.current = false;
        setState(nextState);

        persistDebug("ensureHydrated complete", {
            storedCount: stored.items.length,
            memoryCount: memoryItems.length,
            mergedCount: mergedItems.length,
            reason,
        });
        return userId;
    }, []);

    const persistNow = useCallback((
        userId: string,
        items: MediaQueueItem[],
        activeIndex: number,
        reason: string,
    ) => {
        if (!userId) {
            persistDebug("persistNow EARLY RETURN — empty userId", reason);
            return;
        }
        if (!hydrationCompleteRef.current) {
            persistDebug("persistNow EARLY RETURN — hydrationComplete=false", reason);
            return;
        }
        if (userId !== hydratedUserIdRef.current) {
            persistDebug("persistNow EARLY RETURN — userId mismatch", {
                userId,
                hydrated: hydratedUserIdRef.current,
                reason,
            });
            return;
        }
        const snapshot = queueSnapshot(userId, items, activeIndex);
        if (snapshot === lastPersistedSnapshotRef.current) {
            persistDebug("persistNow EARLY RETURN — snapshot unchanged", reason, "count=", items.length);
            return;
        }
        const allowEmpty = allowEmptyPersistRef.current && items.length === 0;
        if (items.length === 0) {
            allowEmptyPersistRef.current = false;
        }
        persistDebug("persistNow writing", { reason, count: items.length, allowEmpty });
        const wrote = writeStoredQueue(userId, items, activeIndex, { allowEmpty, reason });
        if (wrote) {
            lastPersistedSnapshotRef.current = queueSnapshot(userId, items, activeIndex);
        }
        else if (items.length > 0 || allowEmpty || !storedPayloadHasItems(userId)) {
            lastPersistedSnapshotRef.current = queueSnapshot(userId, items, activeIndex);
        }
    }, []);

    useLayoutEffect(() => {
        persistDebug("layout hydrate effect", { authResolved, accountUserId });
        if (!authResolved) {
            persistDebug("layout hydrate EARLY RETURN — authResolved=false");
            return;
        }
        const userId = String(accountUserId || "").trim();
        if (!userId) {
            persistDebug("layout hydrate EARLY RETURN — no userId");
            return;
        }
        ensureHydrated("layoutEffect");
    }, [accountUserId, authResolved, ensureHydrated]);

    useEffect(() => {
        if (!authResolved) {
            return;
        }
        const userId = ensureHydrated("persistEffect");
        if (!userId || !state.queueHydrated) {
            persistDebug("persist effect skipped", {
                userId,
                queueHydrated: state.queueHydrated,
                hydrationComplete: hydrationCompleteRef.current,
            });
            return;
        }
        persistNow(userId, state.items, state.activeIndex, "effect");
    }, [state.items, state.activeIndex, state.userId, state.queueHydrated, authResolved, accountUserId, ensureHydrated, persistNow]);

    const commit = useCallback((updater: (previous: MediaQueueState) => MediaQueueState, reason = "commit") => {
        const ensuredUserId = ensureHydrated(`commit:${reason}`);
        const previous = stateRef.current;
        const next = updater({
            ...previous,
            userId: previous.userId || ensuredUserId,
            queueHydrated: previous.queueHydrated || hydrationCompleteRef.current,
            authResolved: true,
        });
        stateRef.current = next;
        setState(next);

        const userId = String(next.userId || ensuredUserId || hydratedUserIdRef.current || "").trim();
        persistDebug("commit", {
            reason,
            queueHydrated: next.queueHydrated,
            hydrationComplete: hydrationCompleteRef.current,
            userId,
            itemCount: next.items.length,
            willPersist: Boolean(userId && next.queueHydrated && hydrationCompleteRef.current),
        });

        if (!userId) {
            persistDebug("commit SKIP persist — no userId", reason);
            return;
        }
        if (!next.queueHydrated || !hydrationCompleteRef.current) {
            persistDebug("commit SKIP persist — not hydrated", reason);
            return;
        }
        persistNow(userId, next.items, next.activeIndex, reason);
    }, [ensureHydrated, persistNow]);

    const addItem = useCallback((media: MediaQueueItem) => {
        if (!isMediaQueueItem(media)) {
            return {
                items: stateRef.current.items,
                added: false,
                alreadyQueued: false,
                message: "Media could not be queued.",
                toastKind: "error" as const,
            };
        }
        persistDebug("addItem", mediaQueueItemKey(media), media.title);
        const result = enqueueMedia(stateRef.current.items, media);
        commit((previous) => ({
            ...previous,
            items: result.items,
        }), `addItem:${media.mediaType}`);
        return result;
    }, [commit]);

    const addSongRecordToQueue = useCallback((song: Record<string, unknown>) => {
        const normalized = normalizeSongToQueueItem(song);
        if (!normalized.item) {
            return {
                items: stateRef.current.items,
                added: false,
                alreadyQueued: false,
                message: normalized.error || "Song could not be queued.",
                toastKind: "error" as const,
            };
        }
        return addItem(normalized.item);
    }, [addItem]);

    const addVideoRecordToQueue = useCallback((video: Record<string, unknown>) => {
        persistDebug("video enqueue received", { id: video.id, title: video.title });
        const normalized = normalizeVideoToQueueItem(video);
        if (!normalized.item) {
            persistDebug("video enqueue rejected", normalized.error);
            return {
                items: stateRef.current.items,
                added: false,
                alreadyQueued: false,
                message: normalized.error || "Video could not be queued.",
                toastKind: "error" as const,
            };
        }
        return addItem(normalized.item);
    }, [addItem]);

    const removeMediaFromQueue = useCallback((mediaType: MediaQueueType, id: string) => {
        commit((previous) => {
            const items = dequeueMedia(previous.items, mediaType, id);
            if (items.length === 0 && previous.items.length > 0) {
                allowEmptyPersistRef.current = true;
                persistDebug("queue clear armed — removed last item", `${mediaType}:${id}`);
            }
            const activeItem = previous.activeIndex >= 0 ? previous.items[previous.activeIndex] : null;
            let activeIndex = previous.activeIndex;
            if (activeItem) {
                activeIndex = items.findIndex(
                    (item) => item.mediaType === activeItem.mediaType && item.id === activeItem.id,
                );
            }
            else if (activeIndex >= items.length) {
                activeIndex = items.length - 1;
            }
            return { ...previous, items, activeIndex };
        }, `remove:${mediaType}`);
    }, [commit]);

    const clearQueue = useCallback(() => {
        allowEmptyPersistRef.current = true;
        persistDebug("queue clear — Clear Queue clicked");
        commit((previous) => ({
            ...previous,
            items: clearMediaQueueItems(),
            activeIndex: -1,
        }), "clearQueue");
    }, [commit]);

    const playQueueItem = useCallback((mediaType: MediaQueueType, id: string) => {
        const result = selectQueueItem(stateRef.current.items, stateRef.current.activeIndex, mediaType, id);
        commit((previous) => ({
            ...previous,
            items: result.items,
            activeIndex: result.activeIndex,
        }), "playQueueItem");
        return result.item;
    }, [commit]);

    const playNextQueueItem = useCallback(() => {
        const result = selectNextQueueItem(stateRef.current.items, stateRef.current.activeIndex);
        commit((previous) => ({
            ...previous,
            items: result.items,
            activeIndex: result.activeIndex,
        }), "playNext");
        return result.item;
    }, [commit]);

    const playPreviousQueueItem = useCallback(() => {
        const result = selectPreviousQueueItem(stateRef.current.items, stateRef.current.activeIndex);
        commit((previous) => ({
            ...previous,
            items: result.items,
            activeIndex: result.activeIndex,
        }), "playPrevious");
        return result.item;
    }, [commit]);

    const replaceQueue = useCallback((items: MediaQueueItem[], startIndex = 0) => {
        const result = replaceMediaQueue(items, startIndex);
        if (result.items.length === 0) {
            allowEmptyPersistRef.current = true;
            persistDebug("queue clear armed — replaceQueue empty");
        }
        commit((previous) => ({
            ...previous,
            items: result.items,
            activeIndex: result.activeIndex,
        }), "replaceQueue");
        return result.item;
    }, [commit]);

    const moveItem = useCallback((mediaType: MediaQueueType, id: string, direction: -1 | 1) => {
        commit((previous) => ({
            ...previous,
            items: moveMediaQueueItem(previous.items, mediaType, id, direction),
        }), "moveItem");
    }, [commit]);

    const moveItemTo = useCallback((
        mediaType: MediaQueueType,
        id: string,
        targetType: MediaQueueType,
        targetId: string,
    ) => {
        commit((previous) => ({
            ...previous,
            items: moveMediaQueueItemTo(previous.items, mediaType, id, targetType, targetId),
        }), "moveItemTo");
    }, [commit]);

    const resetQueueOnLogout = useCallback(() => {
        // Memory only — never delete music-data-base:media-queue:<user-id>.
        hydrateGenerationRef.current += 1;
        hydratedUserIdRef.current = "";
        hydrationCompleteRef.current = false;
        lastPersistedSnapshotRef.current = "";
        allowEmptyPersistRef.current = false;
        persistDebug("resetQueueOnLogout — memory cleared, localStorage NOT touched");
        const next = {
            ...clearInMemoryMediaQueue(),
            authResolved: true,
            queueHydrated: false,
            isLoadingQueue: false,
            isSavingQueue: false,
        };
        stateRef.current = next;
        setState(next);
    }, []);

    const items = useMemo(() => uniqueMediaQueueItems(state.items), [state.items]);
    const upNextItems = useMemo(
        () => getUpNextMediaItems(items, state.activeIndex),
        [items, state.activeIndex],
    );

    return {
        mediaQueueItems: items,
        mediaQueueActiveIndex: state.activeIndex,
        upNextQueueItems: upNextItems,
        queueHydrated: state.queueHydrated,
        hydrationComplete: state.queueHydrated,
        isLoadingQueue: state.isLoadingQueue,
        isSavingQueue: state.isSavingQueue,
        queueUserId: state.userId,
        queueCount: items.length,
        isMediaQueued: (mediaType: MediaQueueType, id: string) => isInMediaQueue(items, mediaType, id),
        mediaQueueItemKey,
        addItem,
        addMediaToQueue: addItem,
        addSongRecordToQueue,
        addVideoRecordToQueue,
        removeMediaFromQueue,
        clearQueue,
        playQueueItem,
        playNextQueueItem,
        playPreviousQueueItem,
        replaceQueue,
        moveItem,
        moveItemTo,
        resetQueueOnLogout,
    };
}
