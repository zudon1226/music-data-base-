/**
 * Static verifier: Invite Required gate exposes redeem UI for blocked users.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(relativePath) {
    return readFileSync(path.join(root, relativePath), "utf8");
}

const gate = read("components/founding-member-gate.tsx");
const page = read("app/page.tsx");
const service = read("lib/founding-invite-service.ts");
const en = read("lib/i18n/messages/en.ts");

record(
    "gate has labeled invite code input",
    /htmlFor="founding-gate-invite-code"/.test(gate)
        && /t\("auth\.inviteCode"\)/.test(gate)
        && /id="founding-gate-invite-code"/.test(gate),
);
record(
    "gate has Redeem Invite button",
    /t\("auth\.redeemInvite"\)/.test(gate)
        && /founding-gate-redeem-button/.test(gate)
        && /type="submit"/.test(gate),
);
record(
    "gate redeem controls are 44px high",
    /min-height:\s*44px/.test(gate)
        && /founding-gate-redeem-form input/.test(gate)
        && /founding-gate-redeem-button/.test(gate)
        && /founding-gate-signout/.test(gate),
);
record(
    "gate layout is compact and centered",
    /width:\s*min\(460px,\s*100%\)/.test(gate)
        && /max-width:\s*460px/.test(gate)
        && /place-items:\s*center/.test(gate)
        && /founding-gate-description[\s\S]*?margin:\s*8px 0 0/.test(gate)
        && /founding-gate-meta[\s\S]*?margin:\s*8px 0 0/.test(gate)
        && /founding-gate-redeem-form[\s\S]*?margin:\s*16px 0 0/.test(gate)
        && /founding-gate-redeem-button[\s\S]*?margin:\s*12px 0 0/.test(gate)
        && /founding-gate-signout[\s\S]*?margin:\s*16px 0 0/.test(gate)
        && /\.founding-gate-panel\s*\{[\s\S]*?padding:\s*16px/.test(gate),
);
record(
    "gate redeem form only for blocked status",
    /showRedeemForm/.test(gate)
        && /blocked && Boolean\(onRedeemInvite\) && Boolean\(onInviteCodeChange\)/.test(gate),
);
record(
    "page wires gate redeem to existing APIs",
    /handleGateRedeemInvite/.test(page)
        && /\/api\/founding-invites\/validate/.test(page)
        && /\/api\/founding-invites\/redeem/.test(page)
        && /onRedeemInvite=\{\(\) => void handleGateRedeemInvite\(\)\}/.test(page),
);
record(
    "page refreshes founding access after redeem",
    /reloadFoundingAccess\(userId, accessToken\)/.test(page)
        && /auth\.redeemInviteSuccess/.test(page),
);
record(
    "admin pending list uses founding_members pending status",
    /listFoundingMembersForAdmin/.test(read("app/api/launch/founding-members/route.ts"))
        && /approval_status === "pending"/.test(read("components/founding-onboarding-admin-panel.tsx"))
        && /Approve/.test(read("components/founding-onboarding-admin-panel.tsx"))
        && /Reject/.test(read("components/founding-onboarding-admin-panel.tsx")),
);
record(
    "atomic redeem RPC migration present",
    /redeem_founding_invite_atomic/.test(read("supabase/migrations/202607170005_founding_pending_approval_atomicity.sql"))
        && /repair_orphaned_founding_redemptions/.test(read("supabase/migrations/202607170005_founding_pending_approval_atomicity.sql")),
);
record(
    "service distinguishes invalid/expired/revoked/used",
    /Invite code is invalid\./.test(service)
        && /Invite code has expired\./.test(service)
        && /Invite code has been revoked\./.test(service)
        && /Invite code has already been used\./.test(service)
        && /normalizeInviteCode/.test(service),
);
record(
    "i18n redeem labels present",
    /redeemInvite:\s*"Redeem Invite"/.test(en)
        && /redeemInviteHelp:/.test(en)
        && /redeemInviteSuccess:/.test(en),
);

const fails = results.filter((item) => !item.ok);
console.log(`\nFOUNDING_INVITE_GATE_FAILS=${fails.length}`);
process.exit(fails.length ? 1 : 0);
