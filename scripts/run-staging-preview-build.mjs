import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const env = { ...process.env, VERCEL_ENV: "preview", VERCEL: "1" };
for (const line of readFileSync(".env.staging.local", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const r = spawnSync("npm", ["run", "build"], { env, stdio: "inherit", shell: true });
process.exit(r.status ?? 1);