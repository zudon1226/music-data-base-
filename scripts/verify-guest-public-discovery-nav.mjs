/**
 * Static contract for unified guest public discovery navigation (Phase 29B).
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

expectFile("lib/public-guest-discovery.ts", "Guest discovery path registry missing");
expectFile("components/public-guest/GuestPublicDiscoveryNav.tsx", "Guest discovery nav component missing");
expectFile("components/public-guest/guest-public-discovery-nav.css", "Guest discovery nav styles missing");

for (const route of ["/", "/music", "/videos", "/ringtones", "/mixtapes", "/podcast"]) {
    expect("lib/public-guest-discovery.ts", new RegExp(`"${route.replace("/", "\\/")}"`), `${route} discovery path missing`);
}

expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /data-guest-public-discovery-nav="true"/, "Nav root marker missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /aria-current=\{activeSection === section \? "page" : undefined\}/, "Active page marker missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /layout\?: "inline" \| "horizontal"/, "Horizontal scroll layout missing");
expect("components/public-guest/GuestPublicDiscoveryNav.tsx", /guest-public-discovery-nav--\$\{layout\}/, "Layout class binding missing");
expect("components/public-guest/guest-public-discovery-nav.css", /guest-public-discovery-nav__scroller/, "Horizontal scroller styles missing");
expect("components/public-guest/guest-public-discovery-nav.css", /\[aria-current="page"\]/, "Active state styles missing");

expect("lib/i18n/messages/en.ts", /music:\s*"Music"/, "nav.music string missing");
expect("lib/i18n/messages/en.ts", /ringtones:\s*"Ringtones"/, "nav.ringtones string missing");
expect("lib/i18n/messages/en.ts", /publicGuestDiscovery:/, "nav.publicGuestDiscovery string missing");

expectFile("app/music/page.tsx", "Public music discovery page missing");
expectFile("app/videos/page.tsx", "Public videos discovery page missing");
expectFile("app/ringtones/page.tsx", "Public ringtones discovery page missing");

expect("app/page.tsx", /<GuestPublicDiscoveryNav/, "App shell must render guest discovery nav");
expect("app/page.tsx", /resolveGuestPublicDiscoverySection/, "Guest discovery section resolver wiring missing");
expect("app/page.tsx", /anonymousPublicGuestDiscoveryListener/, "Guest discovery listener gate missing");
expect("app/page.tsx", /layout="horizontal"/, "Horizontal guest nav on mobile shell missing");

expect("components/public-beta/mdb-public-entry.tsx", /<GuestPublicDiscoveryNav[\s\S]*activeSection="home"/, "Public entry hub must render guest discovery nav");

if (failures.length) {
    console.error("verify-guest-public-discovery-nav.mjs failed:");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log("verify-guest-public-discovery-nav.mjs: ok");