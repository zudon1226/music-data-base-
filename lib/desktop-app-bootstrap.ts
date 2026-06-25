/** DESKTOP ONLY — application bootstrap gate and traced remote initialization queue. */

import {
    startUserMusicStateBootstrapInBackground,
    type UserMusicStateLoader,
} from "./desktop-user-music-state-bootstrap";

export const DESKTOP_BOOTSTRAP_LOG_PREFIX = "[desktop-bootstrap]";

export type DesktopBootstrapStep =
    | "localStorageHydration"
    | "profileBootstrap"
    | "songLibrary"
    | "videoLibrary"
    | "albums"
    | "librarySaves"
    | "playlists"
    | "producerData"
    | "artistFollows"
    | "songLikes";

export type DesktopRemoteBootstrapActions = {
    clearRemovedPlaceholderArtwork: () => void;
    reloadSongLibrary: () => Promise<unknown>;
    reloadVideoLibrary: () => Promise<unknown>;
    reloadAlbums: (userId: string) => Promise<unknown>;
    reloadLibrarySaves: (userId: string) => Promise<unknown>;
    reloadUserMusicState: UserMusicStateLoader;
    reloadPlaylists: (userId: string) => Promise<unknown>;
    reloadProducerData: () => Promise<unknown>;
    reloadArtistFollows: () => Promise<unknown>;
    reloadSongLikes: () => Promise<unknown>;
    reloadUserProfile?: (userId: string) => Promise<unknown>;
    showLibraryFailureToast: () => void;
};

export type DesktopShellGateInput = {
    authReady: boolean;
    isAuthenticated: boolean;
    accountUserId: string;
    localBootstrapReady: boolean;
};

export type DesktopShellGateDecision = {
    canRender: boolean;
    blockedBy: "authReady" | "localBootstrapReady" | null;
    detail: string;
};

export type DesktopRemoteBootstrapResult = {
    stalledStep: DesktopBootstrapStep | null;
    completedSteps: DesktopBootstrapStep[];
    failedSteps: DesktopBootstrapStep[];
    userMusicStateOutcome: string;
};

const DEFAULT_STEP_TIMEOUT_MS = 12000;

function formatStepLabel(step: DesktopBootstrapStep) {
    return `${DESKTOP_BOOTSTRAP_LOG_PREFIX} ${step}`;
}

export async function traceBootstrapStep<T>(
    step: DesktopBootstrapStep,
    promise: Promise<T>,
    timeoutMs = DEFAULT_STEP_TIMEOUT_MS,
): Promise<{ ok: true; value: T } | { ok: false; stalledStep: DesktopBootstrapStep; error: unknown }> {
    const label = formatStepLabel(step);
    console.info(`${label} started`);
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            if (settled) {
                return;
            }
            const message = `${label} STALLED after ${timeoutMs}ms — promise never resolved`;
            console.error(message);
            reject(new Error(message));
        }, timeoutMs);
    });

    try {
        const value = await Promise.race([promise, timeoutPromise]);
        settled = true;
        console.info(`${label} completed`);
        return { ok: true, value };
    }
    catch (error) {
        settled = true;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("STALLED after")) {
            return { ok: false, stalledStep: step, error };
        }
        console.warn(`${label} failed`, error);
        return { ok: false, stalledStep: step, error };
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

export function diagnoseDesktopShellGate(input: DesktopShellGateInput): DesktopShellGateDecision {
    if (!input.authReady) {
        return {
            canRender: false,
            blockedBy: "authReady",
            detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: authReady=false (auth initialization still running)`,
        };
    }
    if (!input.localBootstrapReady) {
        return {
            canRender: false,
            blockedBy: "localBootstrapReady",
            detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: localBootstrapReady=false (localStorage hydration has not unblocked the shell)`,
        };
    }
    return {
        canRender: true,
        blockedBy: null,
        detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell unblocked`,
    };
}

export function canRenderDesktopApplicationShell(input: DesktopShellGateInput) {
    const decision = diagnoseDesktopShellGate(input);
    if (!decision.canRender) {
        console.info(decision.detail);
    }
    return decision.canRender;
}

export function startDesktopLocalBootstrap(markReady: () => void, hydrate: () => void) {
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} localStorageHydration shell unblocked`);
    markReady();
    queueMicrotask(() => {
        console.info(`${formatStepLabel("localStorageHydration")} started`);
        try {
            hydrate();
            console.info(`${formatStepLabel("localStorageHydration")} completed`);
        }
        catch (error) {
            console.error(`${formatStepLabel("localStorageHydration")} failed`, error);
        }
    });
}

async function runTracedStep<T>(
    step: DesktopBootstrapStep,
    task: () => Promise<T>,
    completedSteps: DesktopBootstrapStep[],
    failedSteps: DesktopBootstrapStep[],
) {
    const result = await traceBootstrapStep(step, task());
    if (result.ok) {
        completedSteps.push(step);
        return { ok: true as const, value: result.value };
    }
    failedSteps.push(step);
    return { ok: false as const, stalledStep: result.stalledStep, error: result.error };
}

export async function runDesktopRemoteBootstrap(
    userId: string,
    actions: DesktopRemoteBootstrapActions,
): Promise<DesktopRemoteBootstrapResult> {
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue started for user ${userId || "(missing user id)"}`);
    const completedSteps: DesktopBootstrapStep[] = [];
    const failedSteps: DesktopBootstrapStep[] = [];
    let stalledStep: DesktopBootstrapStep | null = null;

    actions.clearRemovedPlaceholderArtwork();

    if (actions.reloadUserProfile && userId) {
        const profileResult = await runTracedStep(
            "profileBootstrap",
            () => actions.reloadUserProfile!(userId),
            completedSteps,
            failedSteps,
        );
        if (!profileResult.ok && !stalledStep) {
            stalledStep = profileResult.stalledStep;
        }
    }

    const songResult = await runTracedStep("songLibrary", actions.reloadSongLibrary, completedSteps, failedSteps);
    if (!songResult.ok && !stalledStep) {
        stalledStep = songResult.stalledStep;
    }

    const videoResult = await runTracedStep("videoLibrary", actions.reloadVideoLibrary, completedSteps, failedSteps);
    if (!videoResult.ok && !stalledStep) {
        stalledStep = videoResult.stalledStep;
    }

    const albumResult = await runTracedStep(
        "albums",
        () => actions.reloadAlbums(userId),
        completedSteps,
        failedSteps,
    );
    if (!albumResult.ok && !stalledStep) {
        stalledStep = albumResult.stalledStep;
    }

    const loadedSongs = songResult.ok ? songResult.value : undefined;
    const loadedVideos = videoResult.ok ? videoResult.value : undefined;
    const loadedAlbums = albumResult.ok ? albumResult.value : undefined;

    const userMusicStateHandle = startUserMusicStateBootstrapInBackground(actions.reloadUserMusicState, {
        loadedSongs,
        loadedVideos,
        loadedAlbums,
    });

    const parallelSteps: Array<[DesktopBootstrapStep, () => Promise<unknown>]> = [
        ["librarySaves", () => actions.reloadLibrarySaves(userId)],
        ["playlists", () => actions.reloadPlaylists(userId)],
    ];

    const parallelResults = await Promise.all(parallelSteps.map(async ([step, task]) => {
        const result = await runTracedStep(step, task, completedSteps, failedSteps);
        return { step, result };
    }));

    for (const entry of parallelResults) {
        if (!entry.result.ok && !stalledStep) {
            stalledStep = entry.result.stalledStep;
        }
    }

    void traceBootstrapStep("producerData", actions.reloadProducerData()).catch((error) => {
        console.warn(`${formatStepLabel("producerData")} background failed`, error);
    });
    void traceBootstrapStep("artistFollows", actions.reloadArtistFollows()).catch((error) => {
        console.warn(`${formatStepLabel("artistFollows")} background failed`, error);
    });
    void traceBootstrapStep("songLikes", actions.reloadSongLikes()).catch((error) => {
        console.warn(`${formatStepLabel("songLikes")} background failed`, error);
    });

    if (stalledStep) {
        console.error(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue halted at ${stalledStep}`);
        actions.showLibraryFailureToast();
    }
    else if (failedSteps.length > 0) {
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue finished with failures: ${failedSteps.join(", ")}`);
    }
    else {
        console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue completed`);
    }

    return {
        stalledStep,
        completedSteps,
        failedSteps,
        userMusicStateOutcome: userMusicStateHandle.outcome,
    };
}
