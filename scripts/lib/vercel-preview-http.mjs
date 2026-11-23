/**
 * HTTP to Vercel Deployment Protection–gated Preview URLs via `vercel curl`.
 * Never logs Authorization headers or request bodies containing secrets.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function parseJsonFromVercelCurlOutput(stdout) {
    const lines = String(stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("{") || line.startsWith("["));
    if (!lines.length) return { ok: false, json: null, raw: String(stdout || "").slice(-500) };
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
            return { ok: true, json: JSON.parse(lines[i]), raw: "" };
        } catch {
            /* continue */
        }
    }
    return { ok: false, json: null, raw: lines.join("\n").slice(-500) };
}

/**
 * @param {string} deploymentUrl Full deployment URL (no trailing slash required)
 * @param {string} pathAndQuery e.g. /api/songs?search=foo
 * @param {{ method?: string, headers?: Record<string,string>, body?: unknown }} [options]
 */
export function vercelPreviewRequest(deploymentUrl, pathAndQuery, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const deployment = deploymentUrl.replace(/\/$/, "");
    const args = ["vercel", "curl", pathAndQuery, "--deployment", deployment, "--yes"];
    const curlArgs = ["--request", method, "--silent", "--show-error"];

    const headers = { ...(options.headers || {}) };
    let headerFile = "";
    const headerEntries = Object.entries(headers).filter(([, value]) => value);
    const needsHeaderFile = headerEntries.some(([, value]) => String(value).length > 120);
    if (needsHeaderFile && headerEntries.length) {
        headerFile = join(tmpdir(), `mdb-vercel-curl-h-${randomUUID()}.txt`);
        writeFileSync(
            headerFile,
            `${headerEntries.map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n`,
            "utf8",
        );
        curlArgs.push("--header", `@${headerFile}`);
    } else {
        for (const [key, value] of headerEntries) {
            curlArgs.push("--header", `${key}: ${value}`);
        }
    }

    let bodyFile = "";
    if (options.body !== undefined && options.body !== null) {
        bodyFile = join(tmpdir(), `mdb-vercel-curl-${randomUUID()}.json`);
        writeFileSync(bodyFile, JSON.stringify(options.body), "utf8");
        curlArgs.push("--header", "Content-Type: application/json", "--data", `@${bodyFile}`);
    }

    args.push("--", ...curlArgs);
    const result = spawnSync("npx", args, {
        encoding: "utf8",
        shell: true,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
    });
    for (const file of [bodyFile, headerFile]) {
        if (!file) continue;
        try {
            unlinkSync(file);
        } catch {
            /* ignore */
        }
    }

    const parsed = parseJsonFromVercelCurlOutput(result.stdout);
    const httpCodeMatch = String(result.stderr || "").match(/\bHTTP\/\S+\s+(\d{3})\b/);
    const status = httpCodeMatch ? Number(httpCodeMatch[1]) : result.status === 0 ? 200 : result.status || 0;

    if (!parsed.ok && result.status !== 0) {
        return {
            ok: false,
            status: status || 0,
            body: null,
            text: `${result.stderr || ""}\n${parsed.raw}`.slice(-600),
        };
    }

    return {
        ok: parsed.ok,
        status: parsed.json && typeof parsed.json.error === "string" ? inferErrorStatus(parsed.json) : status || 200,
        body: parsed.json,
        text: parsed.raw,
    };
}

function inferErrorStatus(body) {
    const err = String(body.error || "");
    if (/log in|unauthorized|authentication/i.test(err)) return 401;
    if (/forbidden|not available|upload is available/i.test(err)) return 403;
    if (/publication choice|required|valid/i.test(err)) return 400;
    return 200;
}