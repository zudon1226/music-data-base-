/** DESKTOP ONLY — upload progress, real byte mapping, 60s stall abort. */

export const DESKTOP_VIDEO_UPLOAD_STALL_TIMEOUT_MS = 60_000;

export const DESKTOP_VIDEO_UPLOAD_STALL_ERROR_MESSAGE =
    "Video upload stopped: no progress for 60 seconds. Check your connection and try again.";

export type DesktopVideoUploadProgressUpdate = {
    percent: number;
    status: string;
    bytesLoaded?: number;
    bytesTotal?: number;
};

export class DesktopVideoUploadStallError extends Error {
    constructor(message = DESKTOP_VIDEO_UPLOAD_STALL_ERROR_MESSAGE) {
        super(message);
        this.name = "DesktopVideoUploadStallError";
    }
}

export type DesktopVideoUploadProgressController = {
    signal: AbortSignal;
    reportPhase: (status: string, percent: number) => void;
    reportBytes: (loaded: number, total: number, status: string, percentRange?: readonly [number, number]) => void;
    throwIfAborted: () => void;
    dispose: () => void;
};

type CreateDesktopVideoUploadProgressControllerOptions = {
    onUpdate: (update: DesktopVideoUploadProgressUpdate) => void;
    stallTimeoutMs?: number;
};

function clampPercent(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function mapBytesToPercent(
    loaded: number,
    total: number,
    range: readonly [number, number],
) {
    const safeTotal = total > 0 ? total : 0;
    if (safeTotal <= 0) {
        return range[0];
    }
    const ratio = Math.max(0, Math.min(1, loaded / safeTotal));
    return clampPercent(range[0] + ratio * (range[1] - range[0]));
}

function readAbortError(signal?: AbortSignal) {
    if (!signal?.aborted) {
        return null;
    }
    const reason = signal.reason;
    if (reason instanceof Error) {
        return reason;
    }
    return new DesktopVideoUploadStallError();
}

export function throwIfDesktopVideoUploadAborted(signal?: AbortSignal) {
    const error = readAbortError(signal);
    if (error) {
        throw error;
    }
}

/** Reject when the upload abort signal fires, even if the underlying promise ignores abort. */
export async function runDesktopVideoUploadWithAbortSignal<T>(
    promise: Promise<T>,
    signal?: AbortSignal,
): Promise<T> {
    throwIfDesktopVideoUploadAborted(signal);
    if (!signal) {
        return promise;
    }

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener("abort", onAbort);
            reject(readAbortError(signal) ?? new DesktopVideoUploadStallError());
        };

        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                if (signal.aborted) {
                    reject(readAbortError(signal) ?? new DesktopVideoUploadStallError());
                    return;
                }
                resolve(value);
            },
            (error) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            },
        );
    });
}

export function createDesktopVideoUploadProgressController(
    options: CreateDesktopVideoUploadProgressControllerOptions,
): DesktopVideoUploadProgressController {
    const stallTimeoutMs = options.stallTimeoutMs ?? DESKTOP_VIDEO_UPLOAD_STALL_TIMEOUT_MS;
    const abortController = new AbortController();
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let lastProgressKey = "";
    let disposed = false;

    const clearStallTimer = () => {
        if (stallTimer) {
            clearTimeout(stallTimer);
            stallTimer = null;
        }
    };

    const abortForStall = () => {
        if (!disposed && !abortController.signal.aborted) {
            abortController.abort(new DesktopVideoUploadStallError());
        }
    };

    const scheduleStallTimer = () => {
        clearStallTimer();
        if (disposed || abortController.signal.aborted) {
            return;
        }
        stallTimer = setTimeout(abortForStall, stallTimeoutMs);
    };

    const noteProgress = (key: string, update: DesktopVideoUploadProgressUpdate) => {
        if (disposed || abortController.signal.aborted) {
            return;
        }
        if (key !== lastProgressKey) {
            lastProgressKey = key;
            options.onUpdate(update);
        }
        scheduleStallTimer();
    };

    const throwIfAborted = () => {
        throwIfDesktopVideoUploadAborted(abortController.signal);
    };

    const reportPhase = (status: string, percent: number) => {
        throwIfAborted();
        noteProgress(`phase:${status}:${percent}`, {
            status,
            percent: clampPercent(percent),
        });
    };

    const reportBytes = (
        loaded: number,
        total: number,
        status: string,
        percentRange: readonly [number, number] = [12, 84],
    ) => {
        throwIfAborted();
        const resolvedTotal = total > 0 ? total : loaded;
        const percent = mapBytesToPercent(loaded, resolvedTotal, percentRange);
        noteProgress(`bytes:${loaded}:${resolvedTotal}:${percent}`, {
            status,
            percent,
            bytesLoaded: loaded,
            bytesTotal: resolvedTotal,
        });
    };

    scheduleStallTimer();

    return {
        signal: abortController.signal,
        reportPhase,
        reportBytes,
        throwIfAborted,
        dispose: () => {
            disposed = true;
            clearStallTimer();
        },
    };
}
