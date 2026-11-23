import { spawnSync } from "node:child_process";

const preview = (process.env.PREVIEW_BASE_URL || "").replace(/\/+$/, "");
if (!preview) {
    console.error("PREVIEW_BASE_URL required");
    process.exit(1);
}

function vercelCurl(args) {
    const result = spawnSync("npx", ["vercel", "curl", ...args], {
        encoding: "utf8",
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
    });
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
    const statusMatch = combined.match(/(\d{3})\s+(?:OK|Unauthorized|Bad Request)/i);
    const jsonMatch = combined.match(/\{[\s\S]*"error"[\s\S]*\}/);
    return {
        exit: result.status ?? 1,
        combined,
        status: statusMatch ? Number(statusMatch[1]) : null,
        body: jsonMatch ? jsonMatch[0] : "",
    };
}

for (const body of ["{}", ""]) {
    const args = [
        "-X",
        "POST",
        `${preview}/api/upload-audio`,
        "-H",
        "Content-Type: application/json",
        "--data",
        body || "{}",
    ];
    const probe = vercelCurl(args);
    console.log(`POST upload-audio body=${JSON.stringify(body)} status=${probe.status} body=${probe.body.slice(0, 160)}`);
    if (probe.status !== 401) {
        console.error("Expected HTTP 401");
        process.exit(1);
    }
}

console.log("probe-preview-guest-upload-auth.mjs: ok");