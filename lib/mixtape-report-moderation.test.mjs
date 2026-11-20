/**
 * Mixtape report moderation auth, transitions, and route contracts.
 * Run: node lib/mixtape-report-moderation.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    canTransitionMixtapeReportStatus,
    isMixtapeReportStatus,
    mixtapeReportQueueBucket,
} from "./mixtape-report-status.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel) {
    return readFileSync(path.join(root, rel), "utf8");
}

assert.equal(isMixtapeReportStatus("open"), true);
assert.equal(isMixtapeReportStatus("reviewing"), true);
assert.equal(isMixtapeReportStatus("removed"), false);

assert.equal(canTransitionMixtapeReportStatus("open", "reviewing"), true);
assert.equal(canTransitionMixtapeReportStatus("open", "resolved"), true);
assert.equal(canTransitionMixtapeReportStatus("resolved", "removed"), false);
assert.equal(canTransitionMixtapeReportStatus("dismissed", "reviewing"), true);
assert.equal(canTransitionMixtapeReportStatus("reviewing", "reviewing"), true);

assert.equal(mixtapeReportQueueBucket("open"), "pending");
assert.equal(mixtapeReportQueueBucket("reviewing"), "reviewed");

const listRoute = read("app/api/mixtapes/reports/moderation/route.ts");
const detailRoute = read("app/api/mixtapes/reports/moderation/[reportId]/route.ts");
const authLib = read("lib/mixtape-report-moderation-auth.ts");
const platformAdmin = read("lib/platform-admin.ts");
const moderationLib = read("lib/mixtape-report-moderation.ts");
const submitRoute = read("app/api/mixtapes/reports/route.ts");

assert.match(listRoute, /requireMixtapeReportModerator/);
assert.match(detailRoute, /requireMixtapeReportModerator/);
assert.match(authLib, /isPlatformAdminUserId/);
assert.match(platformAdmin, /rpc\("is_platform_admin"/);
assert.doesNotMatch(listRoute, /is_admin|isAdmin.*body/i);
assert.doesNotMatch(detailRoute, /is_admin|isAdmin.*body/i);

assert.match(moderationLib, /canTransitionMixtapeReportStatus/);
assert.match(moderationLib, /reporter_user_id/);
assert.doesNotMatch(moderationLib, /from\("mixtapes"\)\.delete/i);
{
    const updateBlocks = [...moderationLib.matchAll(/\.update\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
    assert.ok(updateBlocks.length >= 1, "moderation updates must exist");
    for (const block of updateBlocks) {
        assert.doesNotMatch(block, /reporter_user_id|reason_code|details|mixtape_id/);
    }
}

assert.match(submitRoute, /requireMixtapeRequestUser/);
assert.doesNotMatch(submitRoute, /requireMixtapeReportModerator/);

const page = read("app/page.tsx");
assert.match(page, /MixtapeModerationReports/);
assert.match(read("components/mixtapes/MixtapeModerationReports.tsx"), /reports\/moderation/);

const modReports = read("app/api/moderation/reports/route.ts");
assert.match(modReports, /from\("moderation_reports"\)/, "music/podcast moderation route must remain");

console.log("mixtape-report-moderation.test.mjs passed");