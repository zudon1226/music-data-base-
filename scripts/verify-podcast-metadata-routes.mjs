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

function forbid(relativePath, pattern, label) {
    const source = read(relativePath);
    if (pattern.test(source)) failures.push(`${label} (${relativePath})`);
}

function expectFile(relativePath, label) {
    if (!fs.existsSync(path.join(root, relativePath))) failures.push(`${label} (${relativePath})`);
}

expectFile("lib/public-podcast-metadata.ts", "Public podcast metadata helper missing");

expect("lib/public-podcast-metadata.ts", /export async function loadPublicPodcastShowForMetadata/, "Show metadata loader missing");
expect("lib/public-podcast-metadata.ts", /export async function loadPublicPodcastEpisodeForMetadata/, "Episode metadata loader missing");
expect("lib/public-podcast-metadata.ts", /isUnsafePodcastMetadataMediaUrl/, "Unsafe metadata URL guard missing");

expect("app/podcast/page.tsx", /generateMetadata/, "Discovery page must define generateMetadata");
expect("app/podcast/page.tsx", /buildPodcastDiscoveryMetadata/, "Discovery page must use podcast-specific metadata");
expect("app/podcast/[id]/page.tsx", /generateMetadata/, "Show page must define generateMetadata");
expect("app/podcast/episode/[id]/page.tsx", /generateMetadata/, "Episode page must define generateMetadata");

forbid("next.config.ts", /destination:\s*"\/"/, "Podcast URLs must not rewrite to root");
forbid("next.config.ts", /source:\s*"\/podcast\/:id"/, "Podcast show rewrite must be removed");

expect("app/podcast/[id]/page.tsx", /initialPodcastShowId/, "Show route must hydrate listener shell");
expect("app/podcast/episode/[id]/page.tsx", /initialPodcastEpisodeId/, "Episode route must hydrate listener shell");

const page = read("app/page.tsx");
if (!page.includes("isAnonymousPublicPodcastListenerPath")) {
    failures.push("Anonymous listener path gate must remain in app/page.tsx");
}
if (!page.includes("initialPodcastShowId") || !page.includes("initialPodcastEpisodeId")) {
    failures.push("app/page.tsx must accept initial podcast route props");
}

if (failures.length) {
    console.error("verify-podcast-metadata-routes.mjs failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-podcast-metadata-routes.mjs: ok");