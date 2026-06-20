/** Supabase browser session key for this project (aehuszoadgqtbkxsliyy). */
import { MAX_ACCESS_TOKEN_LENGTH, SUPABASE_AUTH_STORAGE_KEY } from "./auth-session-guard";

export { SUPABASE_AUTH_STORAGE_KEY };
const TRACER_FLAG = "__mdbAuthStorageTracerInstalled";

type OversizedTokenHit = {
    storageName: "localStorage" | "sessionStorage";
    key: string;
    field: string;
    tokenLength: number;
    tokenPrefix: string;
    containerValueLength: number;
};

function collectStorageKeys(storage: Storage) {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key) {
            keys.push(key);
        }
    }
    return keys;
}

function inspectValueForOversizedToken(
    storageName: "localStorage" | "sessionStorage",
    key: string,
    value: string,
) {
    const hits: OversizedTokenHit[] = [];

    function record(field: string, token: unknown) {
        if (typeof token !== "string" || token.length <= MAX_ACCESS_TOKEN_LENGTH) {
            return;
        }
        hits.push({
            storageName,
            key,
            field,
            tokenLength: token.length,
            tokenPrefix: token.slice(0, 50),
            containerValueLength: value.length,
        });
    }

    if (value.length > MAX_ACCESS_TOKEN_LENGTH && value.startsWith("eyJ")) {
        record("(raw value)", value);
    }

    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        record("access_token", parsed.access_token);
        record("refresh_token", parsed.refresh_token);
        if (parsed.currentSession && typeof parsed.currentSession === "object") {
            const currentSession = parsed.currentSession as Record<string, unknown>;
            record("currentSession.access_token", currentSession.access_token);
            record("currentSession.refresh_token", currentSession.refresh_token);
        }
        if (parsed.session && typeof parsed.session === "object") {
            const session = parsed.session as Record<string, unknown>;
            record("session.access_token", session.access_token);
            record("session.refresh_token", session.refresh_token);
        }
    }
    catch {
        // not JSON
    }

    return hits;
}

function scanStorage(storage: Storage, storageName: "localStorage" | "sessionStorage") {
    const keys = collectStorageKeys(storage);
    const hits: OversizedTokenHit[] = [];
    for (const key of keys) {
        const value = storage.getItem(key) || "";
        hits.push(...inspectValueForOversizedToken(storageName, key, value));
    }
    return { keys, hits };
}

export function scanAuthStorageForOversizedTokens(checkpoint: string) {
    if (typeof window === "undefined") {
        return null;
    }

    const local = scanStorage(window.localStorage, "localStorage");
    const session = scanStorage(window.sessionStorage, "sessionStorage");
    const allHits = [...local.hits, ...session.hits];

    console.log("STORAGE_SCAN_CHECKPOINT", checkpoint);
    console.log("LOCAL_STORAGE_KEYS", local.keys);
    console.log("SESSION_STORAGE_KEYS", session.keys);

    if (allHits.length === 0) {
        console.log("OVERSIZED_TOKEN_KEY", null);
        return null;
    }

    for (const hit of allHits) {
        console.error("OVERSIZED_TOKEN_KEY", {
            checkpoint,
            storageName: hit.storageName,
            key: hit.key,
            field: hit.field,
            tokenLength: hit.tokenLength,
            tokenPrefix: hit.tokenPrefix,
            containerValueLength: hit.containerValueLength,
        });
    }

    const primary = allHits.find((hit) => hit.key === SUPABASE_AUTH_STORAGE_KEY) || allHits[0];
    console.error("OVERSIZED_TOKEN_PRIMARY", {
        checkpoint,
        storageKey: primary.key,
        storageName: primary.storageName,
        field: primary.field,
        tokenLength: primary.tokenLength,
    });

    return primary;
}

function isAuthStorageKey(key: string) {
    const normalized = key.toLowerCase();
    return normalized.startsWith("sb-")
        || normalized.includes("-auth-token")
        || normalized.includes("access_token")
        || normalized.includes("refresh_token")
        || normalized === "supabase.auth.token"
        || normalized === "supabase.auth.session";
}

function parseAccessTokenLength(value: string) {
    try {
        const parsed = JSON.parse(value) as {
            access_token?: unknown;
            currentSession?: { access_token?: unknown };
            session?: { access_token?: unknown };
        };
        const token = parsed.access_token
            ?? parsed.currentSession?.access_token
            ?? parsed.session?.access_token;
        return typeof token === "string" ? token.length : null;
    }
    catch {
        return value.startsWith("eyJ") ? value.length : null;
    }
}

export function installAuthStorageWriteTracer() {
    if (typeof window === "undefined") {
        return;
    }
    const globalWindow = window as Window & { [TRACER_FLAG]?: boolean };
    if (globalWindow[TRACER_FLAG]) {
        return;
    }
    globalWindow[TRACER_FLAG] = true;

    function wrapSetItem(storage: Storage, storageName: "localStorage" | "sessionStorage") {
        const originalSetItem = storage.setItem.bind(storage);
        storage.setItem = (key: string, value: string) => {
            if (isAuthStorageKey(key)) {
                const accessTokenLength = parseAccessTokenLength(value);
                console.error("AUTH_STORAGE_WRITE", {
                    storageName,
                    key,
                    valueLength: value.length,
                    accessTokenLength,
                    accessTokenOversized: typeof accessTokenLength === "number"
                        && accessTokenLength > MAX_ACCESS_TOKEN_LENGTH,
                    writeStack: new Error("auth storage write").stack,
                });
            }
            return originalSetItem(key, value);
        };
    }

    wrapSetItem(window.localStorage, "localStorage");
    wrapSetItem(window.sessionStorage, "sessionStorage");

    console.log("AUTH_STORAGE_WRITE_TRACER_INSTALLED", {
        expectedSupabaseKey: SUPABASE_AUTH_STORAGE_KEY,
    });
}
