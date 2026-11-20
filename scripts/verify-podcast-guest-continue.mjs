import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];

function forbid(relativePath, pattern, label) {
    if (pattern.test(read(relativePath))) failures.push(`${label} (${relativePath})`);
}

function expect(relativePath, pattern, label) {
    if (!pattern.test(read(relativePath))) failures.push(`${label} (${relativePath})`);
}

forbid(
    "components/podcasts/PodcastDiscoveryWorkspace.tsx",
    /progress:\s*userId\s*\?\s*continueListeningProgress\s*:\s*\[\]/,
    "Continue listening must not drop guest local progress",
);

expect(
    "components/podcasts/PodcastDiscoveryWorkspace.tsx",
    /progress:\s*continueListeningProgress/,
    "Discovery must pass Continue listening progress for all visitors",
);

expect("lib/podcast-resume.shared.mjs", /export function sanitizePodcastResumeProgressList/, "Guest progress sanitizer missing");

const page = read("app/page.tsx");
if (!page.includes("sanitizePodcastResumeProgressList")) {
    failures.push("app/page.tsx must sanitize podcast Continue listening progress");
}
if (!/if \(!userId \|\| !isDesktopProtectedActionsEnabled\(\)\)\s*\n\s*return;/.test(page)) {
    failures.push("Guest podcast plays must not sync Recently Played to the server");
}

if (failures.length) {
    console.error("verify-podcast-guest-continue.mjs failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-podcast-guest-continue.mjs: ok");