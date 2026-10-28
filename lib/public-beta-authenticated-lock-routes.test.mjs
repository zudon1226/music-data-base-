/**
 * Isolated route tests for authenticated public-beta locks.
 * Authentication is a fixed test user. Stripe and database writes are mocked.
 * Fetch allows loopback only. Every other host is rejected before the request.
 *
 * Run: node --import ./scripts/register-beta-lock-route-harness.mjs lib/public-beta-authenticated-lock-routes.test.mjs
 */
import assert from "node:assert/strict";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const RINGTONE_ID = "44444444-4444-4444-8444-444444444444";
const lockEnvNames = [
    "NEXT_PUBLIC_PUBLIC_BETA_PAID_SALES_CHECKOUT_LOCKED",
    "NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED",
    "NEXT_PUBLIC_PUBLIC_BETA_PAYOUT_REQUESTS_LOCKED",
    "NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED",
    "NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED",
];
for (const name of lockEnvNames) delete process.env[name];

const probe = { writes: [], stripe: 0, tickets: 0, network: [] };
globalThis.__mdbBetaLockProbe = probe;
const originalFetch = globalThis.fetch;

function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    if (input && typeof input.url === "string") return input.url;
    return "";
}

function isLoopback(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        return parsed.hostname === "127.0.0.1"
            || parsed.hostname === "localhost"
            || parsed.hostname === "::1";
    } catch {
        return false;
    }
}

globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    if (isLoopback(url)) return originalFetch(input, init);
    try {
        const parsed = new URL(url);
        probe.network.push(`${parsed.protocol}//${parsed.host}${parsed.pathname}`);
    } catch {
        probe.network.push("unparseable");
    }
    throw new Error("external network is blocked in the lock harness");
};

const { POST: salesPost } = await import("../app/api/sales/checkout/route.ts");
const { POST: sponsorPost } = await import("../app/api/sponsors/checkout/route.ts");
const { POST: payoutPost } = await import("../app/api/payouts/route.ts");
const { POST: subscriptionPost } = await import("../app/api/subscriptions/checkout/route.ts");
const { POST: purchasePost } = await import("../app/api/ringtones/[id]/purchase/route.ts");
const { POST: downloadPost } = await import("../app/api/ringtones/[id]/download/route.ts");
const { POST: ticketPost } = await import("../app/api/ringtones/[id]/download-ticket/route.ts");

function request(path, body) {
    return new Request(`http://127.0.0.1${path}`, {
        method: "POST",
        headers: {
            authorization: "Bearer isolated-test-session",
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

async function call(handler, path, body, context) {
    const response = await handler(request(path, body), context);
    const payload = await response.json();
    return { status: response.status, code: payload.code || null };
}

const ringtoneContext = { params: Promise.resolve({ id: RINGTONE_ID }) };
const results = {
    sales: await call(salesPost, "/api/sales/checkout", {}),
    sponsor: await call(sponsorPost, "/api/sponsors/checkout", {
        userId: USER_ID,
        applicationId: "00000000-0000-4000-8000-000000000099",
    }),
    payout: await call(payoutPost, "/api/payouts", {
        userId: USER_ID,
        creatorType: "artist",
        amountCents: 1,
    }),
    subscription: await call(subscriptionPost, "/api/subscriptions/checkout", {
        userId: USER_ID,
        planSlug: "premium-listener",
        audience: "listener",
        successUrl: "http://127.0.0.1:3000/",
        cancelUrl: "http://127.0.0.1:3000/",
    }),
    purchase: await call(purchasePost, `/api/ringtones/${RINGTONE_ID}/purchase`, {
        userId: USER_ID,
    }, ringtoneContext),
    download: await call(downloadPost, `/api/ringtones/${RINGTONE_ID}/download`, {
        userId: USER_ID,
        deviceType: "android",
    }, ringtoneContext),
    ticket: await call(ticketPost, `/api/ringtones/${RINGTONE_ID}/download-ticket`, {
        userId: USER_ID,
    }, ringtoneContext),
};

assert.deepEqual(results.sales, { status: 403, code: "SALES_CHECKOUT_LOCKED" });
assert.deepEqual(results.sponsor, { status: 503, code: "SPONSOR_CHECKOUT_LOCKED" });
assert.deepEqual(results.payout, { status: 403, code: "PAYOUT_REQUESTS_LOCKED" });
assert.deepEqual(results.subscription, { status: 403, code: "SUBSCRIPTION_CHECKOUT_LOCKED" });
assert.deepEqual(results.purchase, { status: 503, code: "PURCHASING_UNAVAILABLE" });
assert.deepEqual(results.download, { status: 403, code: "PURCHASING_UNAVAILABLE" });
assert.deepEqual(results.ticket, { status: 403, code: "PURCHASING_UNAVAILABLE" });
assert.deepEqual(probe.writes, []);
assert.equal(probe.stripe, 0);
assert.equal(probe.tickets, 0);
assert.deepEqual(probe.network, []);

console.log("public-beta-authenticated-lock-routes.test.mjs passed");
console.log(JSON.stringify(results));
