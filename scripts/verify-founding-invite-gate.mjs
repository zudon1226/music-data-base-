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
        && /founding-gate-redeem-button/.test(gate),
);
record(
    "gate redeem form only for blocked status",
    /blocked && onRedeemInvite && onInviteCodeChange/.test(gate),
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
