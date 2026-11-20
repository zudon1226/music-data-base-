import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];

function expect(relativePath, pattern, label) {
    const source = read(relativePath);
    if (!pattern.test(source)) failures.push(`${label} (${relativePath})`);
}

function expectFile(relativePath, label) {
    if (!fs.existsSync(path.join(root, relativePath))) failures.push(`${label} (${relativePath})`);
}

expectFile("app/podcast/page.tsx", "Public podcast discovery route missing");
expectFile("lib/public-podcast-listener.ts", "Public podcast listener helper missing");

expect("lib/public-podcast-listener.ts", /export function isAnonymousPublicPodcastListenerPath/, "Path gate helper missing");
expect("lib/public-podcast-listener.ts", /export function isAnonymousPublicPodcastListenerView/, "View gate helper missing");
expect("app/podcast/page.tsx", /initialPublicPodcastDiscovery/, "Discovery page must mount discovery shell prop");

const page = read("app/page.tsx");
if (!page.includes("isAnonymousPublicPodcastListenerPath")) {
    failures.push("app/page.tsx must gate login surface with isAnonymousPublicPodcastListenerPath");
}
if (!page.includes("anonymousPublicPodcastListener")) {
    failures.push("app/page.tsx must define anonymousPublicPodcastListener mode");
}
if (!/shouldShowLoginScreen\s*&&\s*!anonymousPublic(GuestListener|PodcastListener)/.test(page)
    && !/!\s*anonymousPublic(GuestListener|PodcastListener)[\s\S]*shouldShowLoginScreen/.test(page)) {
    failures.push("Login surface must stay enabled off public listener paths only");
}
if (!page.includes("redirectAnonymousPublicPodcastListenerToLoginHub")) {
    failures.push("Protected navigation must send visitors to login hub");
}
expect("lib/public-podcast-listener.ts", /buildAnonymousPublicPodcastLoginHubUrl/, "Login hub URL helper missing");
expect("lib/public-podcast-listener.ts", /ANONYMOUS_PUBLIC_PODCAST_RETURN_PATH_KEY/, "Login return path key missing");
if (!page.includes("publicPodcastListenerOnly")) {
    failures.push("Chrome must expose publicPodcastListenerOnly nav mode");
}
if (!page.includes('data-public-podcast-listener-mode')) {
    failures.push("Shell should expose data-public-podcast-listener-mode for tests");
}

if (failures.length) {
    console.error("verify-public-podcast-listener.mjs failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-public-podcast-listener.mjs: ok");