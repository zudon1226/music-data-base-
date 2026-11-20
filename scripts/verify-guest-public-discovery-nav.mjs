/**
 * Static contract for unified guest public discovery navigation.
 */
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

expectFile("components/public-guest/GuestPublicDiscoveryNav.tsx", "Guest discovery nav component missing");
expectFile("components/public-guest/guest-public-discovery-nav.css", "Guest discovery nav styles missing");

expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /data-guest-public-discovery-nav="true"/, "Nav root marker missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /href: "\/"/, "Home route link missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /href: "\/mixtapes"/, "Mixtapes route link missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /href: "\/podcast"/, "Podcasts route link missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /aria-current=\{activeSection === item\.section \? "page" : undefined\}/, "Active page marker missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /nav\.home/, "Home i18n key missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /nav\.mixtapes/, "Mixtapes i18n key missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /nav\.podcasts/, "Podcasts i18n key missing");

expect("lib/i18n/messages/en.ts", /podcasts:\s*"Podcasts"/, "nav.podcasts string missing");
expect("lib/i18n/messages/en.ts", /publicGuestDiscovery:/, "nav.publicGuestDiscovery string missing");

expect("app/page.tsx", /<GuestPublicDiscoveryNav/, "App shell must render guest discovery nav");
expect("app/page.tsx", /anonymousPublicMixtapeListener \? "mixtapes" : "podcasts"/, "Listener shell active section wiring missing");
expect("components/public-beta/mdb-public-entry.tsx", /<GuestPublicDiscoveryNav activeSection="home"/, "Public entry hub must render guest discovery nav");

expect("components/desktop-app-sidebar-nav.tsx", /publicMixtapeListenerOnly/, "Desktop module sidebar contract must remain");
expect("app/page.tsx", /publicMixtapeListenerOnly=\{anonymousPublicMixtapeListener\}/, "Mixtape listener-only sidebar flag must remain");

if (failures.length) {
    console.error("verify-guest-public-discovery-nav.mjs failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-guest-public-discovery-nav.mjs: ok");