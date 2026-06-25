/** DESKTOP ONLY — userMusicState bootstrap (never blocks Home or the remote boot queue). */

export const USER_MUSIC_STATE_BOOTSTRAP_LOG = "[desktop-user-music-state-bootstrap]";

/** Foreground observation window — boot queue does not wait longer than this. */
export const USER_MUSIC_STATE_FOREGROUND_TIMEOUT_MS = 2000;

export type UserMusicStateLoader = (
    loadedSongs?: unknown,
    loadedVideos?: unknown,
    loadedAlbums?: unknown,
) => Promise<unknown>;

export type UserMusicStateBootstrapContext = {
    loadedSongs?: unknown;
    loadedVideos?: unknown;
    loadedAlbums?: unknown;
};

export type UserMusicStateBootstrapOutcome =
    | "loaded-in-foreground"
    | "continued-with-default-background-pending"
    | "failed-in-foreground"
    | "skipped-no-loader";

export type UserMusicStateBootstrapHandle = {
    outcome: UserMusicStateBootstrapOutcome;
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
 * Requirement 3 — resolve userMusicState bootstrap immediately after localStorage hydration.
 * Home never waits on the remote /api/user-music-state call.
 */
export function resolveUserMusicStateBootstrapAfterLocalHydration(markReady: () => void) {
    markReady();
    logInfo("bootstrap resolved after localStorageHydration (default empty state until remote fetch applies)");
}

/**
 * Requirement 1/2/4/5/6 — start remote userMusicState fetch without blocking the boot queue.
 * Returns immediately; the loader keeps the existing API contract (/api/user-music-state GET).
 */
export function startUserMusicStateBootstrapInBackground(
    loader: UserMusicStateLoader | undefined,
    context: UserMusicStateBootstrapContext = {},
): UserMusicStateBootstrapHandle {
    if (!loader) {
        logInfo("skipped — no loader registered");
        return { outcome: "skipped-no-loader" };
    }

    logInfo("background fetch started");

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

    void Promise.race([
        remotePromise.then(() => "done" as const),
        new Promise<"timeout">((resolve) => {
            window.setTimeout(() => resolve("timeout"), USER_MUSIC_STATE_FOREGROUND_TIMEOUT_MS);
        }),
    ]).then((raceResult) => {
        if (raceResult === "timeout" && !foregroundFinished) {
            logWarn(
                `continuing boot with default empty state after ${USER_MUSIC_STATE_FOREGROUND_TIMEOUT_MS}ms — background fetch continues`,
            );
            void remotePromise.then((value) => {
                if (value != null) {
                    logInfo("background fetch applied remote userMusicState");
                }
            });
            return;
        }
        if (foregroundFailed) {
            logError("foreground window ended with API failure — boot queue unaffected");
        }
    });

    return { outcome: "continued-with-default-background-pending" };
}
