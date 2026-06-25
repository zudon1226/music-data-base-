/** DESKTOP ONLY — non-blocking userMusicState bootstrap (never blocks Home or the boot queue). */

export const USER_MUSIC_STATE_BOOTSTRAP_LOG = "[desktop-user-music-state-bootstrap]";

/** Foreground wait window — boot continues with default empty state after this. */
export const USER_MUSIC_STATE_FOREGROUND_TIMEOUT_MS = 2000;

export type UserMusicStateLoader = (
    loadedSongs?: unknown,
    loadedVideos?: unknown,
    loadedAlbums?: unknown,
) => Promise<unknown>;

export type UserMusicStateBootstrapOutcome =
    | "loaded-in-foreground"
    | "continued-with-default-background-pending"
    | "failed-in-foreground"
    | "skipped-no-loader";

export type UserMusicStateBootstrapResult = {
    outcome: UserMusicStateBootstrapOutcome;
    /** Always true — this step never blocks the remote bootstrap queue. */
    queueContinues: true;
};

function logInfo(message: string) {
    console.info(`${USER_MUSIC_STATE_BOOTSTRAP_LOG} ${message}`);
}

function logWarn(message: string) {
    console.warn(`${USER_MUSIC_STATE_BOOTSTRAP_LOG} ${message}`);
}

function logError(message: string, error?: unknown) {
    console.error(`${USER_MUSIC_STATE_BOOTSTRAP_LOG} ${message}`, error ?? "");
}

/**
 * Requirement 3 — mark userMusicState bootstrap resolved as soon as local storage
 * hydration unblocks the shell. Remote fetch runs later and never gates Home.
 */
export function resolveUserMusicStateBootstrapAfterLocalHydration(markReady: () => void) {
    markReady();
    logInfo("bootstrap resolved after localStorageHydration (default empty state until remote fetch applies)");
}

/**
 * Requirement 2/4/5 — wait at most 2s in the foreground boot queue, then continue with
 * default empty state while the same loader promise keeps running in the background.
 * Never throws; never halts the bootstrap queue.
 */
export async function runUserMusicStateBootstrapNonBlocking(
    loader: UserMusicStateLoader | undefined,
    context: {
        loadedSongs?: unknown;
        loadedVideos?: unknown;
        loadedAlbums?: unknown;
    } = {},
): Promise<UserMusicStateBootstrapResult> {
    if (!loader) {
        logInfo("skipped — no loader registered");
        return { outcome: "skipped-no-loader", queueContinues: true };
    }

    logInfo("started");

    let foregroundFinished = false;
    let foregroundFailed = false;

    const remotePromise = loader(context.loadedSongs, context.loadedVideos, context.loadedAlbums)
        .then((value) => {
            foregroundFinished = true;
            logInfo("remote load completed");
            return value;
        })
        .catch((error) => {
            foregroundFinished = true;
            foregroundFailed = true;
            logError("remote load failed", error);
            return null;
        });

    const timedOut = await Promise.race([
        remotePromise.then(() => false),
        new Promise<boolean>((resolve) => {
            window.setTimeout(() => resolve(true), USER_MUSIC_STATE_FOREGROUND_TIMEOUT_MS);
        }),
    ]);

    if (!foregroundFinished && timedOut) {
        logWarn(
            `continuing boot with default empty state after ${USER_MUSIC_STATE_FOREGROUND_TIMEOUT_MS}ms — background fetch continues`,
        );
        void remotePromise.then((value) => {
            if (value != null) {
                logInfo("background fetch applied remote userMusicState");
            }
        });
        return { outcome: "continued-with-default-background-pending", queueContinues: true };
    }

    if (foregroundFailed) {
        return { outcome: "failed-in-foreground", queueContinues: true };
    }

    return { outcome: "loaded-in-foreground", queueContinues: true };
}
