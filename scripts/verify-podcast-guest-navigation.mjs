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

expectFile("lib/podcast-guest-discovery.shared.mjs", "Guest discovery helper missing");
expectFile("lib/podcast-guest-discovery.test.mjs", "Guest discovery unit test missing");

expect("lib/public-podcast-listener.ts", /buildAnonymousPublicPodcastLoginHubUrl/, "Login hub URL builder missing");
expect("lib/public-podcast-listener.ts", /ANONYMOUS_PUBLIC_PODCAST_LOGIN_QUERY/, "Login intent query param missing");
expect("lib/public-podcast-listener.ts", /storeAnonymousPublicPodcastReturnPath/, "Post-login return path storage missing");

expect("components/desktop-app-sidebar-nav.tsx", /publicPodcastListenerOnly[\s\S]*onPublicPodcastLogin/, "Desktop guest login hook missing");
expect("components/mobile-app-horizontal-nav.tsx", /onPublicPodcastLogin/, "Mobile guest login hook missing");
expect("components/mobile-app-horizontal-nav.tsx", /data-public-podcast-login="true"/, "Mobile Log in control missing");

expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /visiblePodcastDiscoverySectionIds/, "Guest discovery tab filter missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /data-podcast-guest-sign-in-prompt/, "Guest sign-in prompt missing");
expect("components/podcasts/PodcastDiscoveryWorkspace.tsx", /visibleDiscoverySections\.map/, "Signed-in tabs must remain wired via visibleDiscoverySections");

forbid("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Sign in to see saved podcasts/, "Guest Saved empty state must not mislead");
forbid("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Sign in to see shows you follow/, "Guest Following empty state must not mislead");
forbid("components/podcasts/PodcastDiscoveryWorkspace.tsx", /Sign in to see liked podcasts/, "Guest Liked empty state must not mislead");

const pageSource = read("app/page.tsx");

if (!/onPublicPodcastLogin=\{/.test(pageSource)) {
    failures.push("Page must pass onPublicPodcastLogin to guest nav (app/page.tsx)");
}
if (!/redirectAnonymousPublicPodcastListenerToLoginHub/.test(pageSource)) {
    failures.push("Page must call redirectAnonymousPublicPodcastListenerToLoginHub (app/page.tsx)");
}
if (!/redirectAnonymousPublicMixtapeListenerToLoginHub/.test(pageSource)) {
    failures.push("Page must call redirectAnonymousPublicMixtapeListenerToLoginHub for mixtape guest login (app/page.tsx)");
}
if (
    !/anonymousPublicMixtapeListener[\s\S]{0,400}redirectAnonymousPublicMixtapeListenerToLoginHub[\s\S]{0,400}redirectAnonymousPublicPodcastListenerToLoginHub/.test(
        pageSource,
    )
) {
    failures.push("onPublicPodcastLogin must branch mixtape vs podcast guest login handlers (app/page.tsx)");
}
if (!/consumeAnonymousPublicPodcastReturnPath/.test(pageSource)) {
    failures.push("Page must restore podcast return path after auth (app/page.tsx)");
}
if (!/anonymousPublicListener=\{anonymousPublicPodcastListener\}/.test(pageSource)) {
    failures.push("Podcast discovery must receive guest listener mode (app/page.tsx)");
}
if (!/<DesktopAppSidebarNav[\s\S]*onPublicPodcastLogin=/.test(pageSource)) {
    failures.push("Desktop sidebar must wire onPublicPodcastLogin (app/page.tsx)");
}
if (!/<MobileAppHorizontalNav[\s\S]*onPublicPodcastLogin=/.test(pageSource)) {
    failures.push("Mobile nav must wire onPublicPodcastLogin (app/page.tsx)");
}

expect("scripts/verify-public-podcast-listener.mjs", /buildAnonymousPublicPodcastLoginHubUrl/, "Public listener verify must track login hub URL");

expectFile("components/public-guest/GuestPublicDiscoveryNav.tsx", "Unified guest discovery nav missing");
expect("app/page.tsx", /<GuestPublicDiscoveryNav/, "Listener shells must render unified guest discovery nav");

if (failures.length) {
    console.error("verify-podcast-guest-navigation.mjs failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-podcast-guest-navigation.mjs: ok");