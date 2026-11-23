/**
 * Ensures committed page.tsx import graph resolves (Phase 28F).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(path.join(root, "app/page.tsx"), "utf8");

const importPaths = [];
for (const match of page.matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)) {
    importPaths.push(match[1]);
}
for (const match of page.matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
    importPaths.push(match[1].replace(/^@\//, ""));
}

function resolveImport(rel) {
    const base = path.join(root, rel.replace(/^\.\.\//, "").replace(/^\.\//, ""));
    if (rel.startsWith("../")) {
        const resolved = path.normalize(path.join(root, "app", rel));
        const candidates = [
            resolved,
            `${resolved}.ts`,
            `${resolved}.tsx`,
            `${resolved}.mjs`,
            path.join(resolved, "index.ts"),
            path.join(resolved, "index.tsx"),
        ];
        return candidates.find((c) => existsSync(c));
    }
    const fromRoot = path.join(root, rel);
    const candidates = [
        `${fromRoot}.ts`,
        `${fromRoot}.tsx`,
        `${fromRoot}.mjs`,
        fromRoot,
    ];
    return candidates.find((c) => existsSync(c));
}

let fails = 0;
const checked = new Set();
for (const imp of importPaths) {
    if (checked.has(imp)) continue;
    checked.add(imp);
    const isRelativeFromApp = imp.startsWith("../");
    if (isRelativeFromApp) {
        const resolved = path.normalize(path.join(root, "app", imp));
        const found = [
            resolved,
            `${resolved}.ts`,
            `${resolved}.tsx`,
            `${resolved}.mjs`,
        ].find((c) => existsSync(c));
        if (!found) {
            console.log(`FAIL missing ${imp}`);
            fails += 1;
        }
    } else {
        const found = resolveImport(imp);
        if (!found) {
            console.log(`FAIL missing @/${imp}`);
            fails += 1;
        }
    }
}

const required = [
    "lib/song-play-client.ts",
    "components/creator/CreatorDashboardWorkspace.tsx",
    "lib/signup-account-type.ts",
];
for (const rel of required) {
    if (!existsSync(path.join(root, rel))) {
        console.log(`FAIL required ${rel}`);
        fails += 1;
    }
}

if (fails) {
    console.log(`\nverify-phase28-preview-build-deps FAIL (${fails})`);
    process.exit(1);
}
console.log(`verify-phase28-preview-build-deps PASS (${checked.size} imports checked)`);