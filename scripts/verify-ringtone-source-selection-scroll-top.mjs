/**
 * Verify Create Ringtone scrolls to workflow top after source selection.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, passed, detail = "") {
    results.push({ name, passed });
    console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");

record("workspace ref attached to create page", workspace.includes("ref={workspaceRef}") && workspace.includes("data-ringtone-creator=\"workspace\""));
record("uses getMainScrollContainer not window-only scroll", workspace.includes("getMainScrollContainer"));
record("uses scrollContainerToElement once after render", workspace.includes("scrollContainerToElement(main, target, 0)") && workspace.includes("pendingSourceScrollRef"));
record("single rAF after source selection state", workspace.includes("requestAnimationFrame") && workspace.includes("pendingSourceScrollRef.current = false"));
record("owned song selection advances to clip step then scrolls", workspace.includes("setStep(2)") && workspace.includes("pendingSourceScrollRef.current = true"));
record("upload selection also requests scroll", workspace.includes("pendingSourceScrollRef.current = true"));
record("clears horizontal scroll", workspace.includes("main.scrollLeft = 0"));
record("marks navigation scroll lock", workspace.includes("markNavigationScrollLock"));
record("does not spam scrollIntoView loops", !/scrollIntoView\([\s\S]*scrollIntoView/.test(workspace));

const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
