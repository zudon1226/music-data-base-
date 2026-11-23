import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const env = { ...process.env, VERCEL_ENV: "preview", VERCEL: "1", PORT: process.env.PORT || "3010" };
for (const line of readFileSync(".env.staging.local", "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
const child = spawn("npm", ["run", "dev", "--", "-p", env.PORT], { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));