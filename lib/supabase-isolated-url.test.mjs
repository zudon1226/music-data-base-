/**
 * Isolated local Supabase URLs are allowed only with the explicit E2E flag.
 * Run: npx tsx lib/supabase-isolated-url.test.mjs
 */
import assert from "node:assert/strict";
import { readDesktopSupabaseAuthConfig } from "./supabase-auth-client.ts";
import {
    isApprovedIsolatedLocalSupabaseUrl,
    readSupabaseProjectUrl,
    SUPABASE_PROJECT_URL,
} from "./supabase-config.ts";

const previous = {
    flag: process.env.MDB_ISOLATED_SUPABASE_E2E,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function setEnv({ flag, url, anon = "isolated-test-anon" }) {
    if (flag === undefined) delete process.env.MDB_ISOLATED_SUPABASE_E2E;
    else process.env.MDB_ISOLATED_SUPABASE_E2E = flag;
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anon;
}

try {
    setEnv({ flag: "1", url: "http://127.0.0.1:54321" });
    assert.equal(readSupabaseProjectUrl(), "http://127.0.0.1:54321");
    assert.equal(isApprovedIsolatedLocalSupabaseUrl("http://127.0.0.1:54321"), true);
    assert.equal(readDesktopSupabaseAuthConfig().supabaseUrl, "http://127.0.0.1:54321");

    setEnv({ flag: "1", url: "http://localhost:54321" });
    assert.equal(readSupabaseProjectUrl(), "http://localhost:54321");
    assert.equal(readDesktopSupabaseAuthConfig().supabaseUrl, "http://localhost:54321");

    setEnv({ flag: undefined, url: "http://127.0.0.1:54321" });
    assert.throws(() => readSupabaseProjectUrl(), /requires MDB_ISOLATED_SUPABASE_E2E=1/);
    assert.equal(isApprovedIsolatedLocalSupabaseUrl("http://127.0.0.1:54321"), false);
    assert.throws(() => readDesktopSupabaseAuthConfig(), /Supabase project URL|requires MDB_ISOLATED_SUPABASE_E2E=1/);

    for (const url of [
        "http://203.0.113.10:54321",
        "http://192.168.1.20:54321",
        "http://evil.example",
        "https://evil.example",
        "http://127.0.0.1:80",
        "http://127.0.0.1:54322",
        "https://127.0.0.1:54321",
        "http://127.0.0.1:54321/auth",
        "http://user:pass@127.0.0.1:54321",
        "https://example.supabase.co",
    ]) {
        setEnv({ flag: "1", url });
        assert.equal(isApprovedIsolatedLocalSupabaseUrl(url), false, url);
        assert.throws(() => readSupabaseProjectUrl(), /MDB_ISOLATED_SUPABASE_E2E/, url);
        assert.throws(
            () => readDesktopSupabaseAuthConfig(),
            /MDB_ISOLATED_SUPABASE_E2E|must be https|must target|Supabase project URL/,
            url,
        );
    }

    setEnv({
        flag: "1",
        url: "http://127.0.0.1:54321/?project=aehuszoadgqtbkxsliyy",
    });
    assert.throws(() => readSupabaseProjectUrl(), /production ref/);

    setEnv({ flag: undefined, url: "http://evil.example" });
    assert.throws(() => readSupabaseProjectUrl(), /Supabase project URL/);
    assert.throws(() => readDesktopSupabaseAuthConfig(), /Supabase project URL/);

    setEnv({ flag: undefined, url: undefined });
    assert.equal(readSupabaseProjectUrl(), SUPABASE_PROJECT_URL);
    assert.equal(readDesktopSupabaseAuthConfig().supabaseUrl, SUPABASE_PROJECT_URL);
}
finally {
    if (previous.flag === undefined) delete process.env.MDB_ISOLATED_SUPABASE_E2E;
    else process.env.MDB_ISOLATED_SUPABASE_E2E = previous.flag;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.anon;
}

console.log("supabase-isolated-url tests passed.");
