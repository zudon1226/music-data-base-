import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const failures = [];

function expect(relativePath, pattern, label) {
    if (!pattern.test(read(relativePath))) failures.push(`${label} (${relativePath})`);
}

function forbid(relativePath, pattern, label) {
    if (pattern.test(read(relativePath))) failures.push(`${label} (${relativePath})`);
}

expect("app/page.tsx", /MixtapeListeningControls/, "Mixtape listening controls in player chrome");
expect("app/page.tsx", /currentSong\.type === "Mixtape"/, "Mixtape-only player branch");
expect("app/page.tsx", /mixtapePlaybackContext/, "Mixtape track context for next/previous");
expect("app/page.tsx", /playAdjacentMixtapeTrack/, "Adjacent mixtape track navigation");
expect("app/page.tsx", /resolveMixtapePlayback/, "Secure mixtape playback resolver");
expect("components/mixtapes/MixtapeStudioAnalyticsPanel.tsx", /\/api\/mixtapes\/analytics/, "Studio analytics API wiring");
expect("components/mixtapes/MixtapeStudioAnalyticsPanel.tsx", /catalogPlays/, "Analytics labels catalog play totals");
expect("components/mixtapes/MixtapeStudioWorkspace.tsx", /prepare-cover/, "Studio cover upload wiring");
expect("components/mixtapes/MixtapeStudioWorkspace.tsx", /MixtapeStudioAnalyticsPanel/, "Analytics panel mounted in studio");

forbid("components/mixtapes/MixtapeStudioAnalyticsPanel.tsx", /recent engagement|last 7 days|30 days/i, "No invented time-range metrics");

if (failures.length > 0) {
    console.error("mixtape-phase2-ui.test.mjs failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
}

console.log("mixtape-phase2-ui.test.mjs passed");