import assert from "node:assert/strict";
import {
    buildSignUpNoSessionMessage,
    classifySignUpWithoutSession,
    resolveAuthTransportErrorMessage,
    resolveSignUpClientErrorMessage,
} from "./signup-auth-response.ts";

assert.equal(
    classifySignUpWithoutSession({ email_confirmed_at: null, identities: [{ id: "x" }] }),
    "likely_pending_confirmation",
    "new signup with identity",
);

assert.equal(
    classifySignUpWithoutSession({ email_confirmed_at: "2026-01-01T00:00:00Z", identities: [{ id: "x" }] }),
    "likely_existing_account",
    "confirmed email without session",
);

assert.equal(
    classifySignUpWithoutSession({ email_confirmed_at: null, identities: [] }),
    "likely_existing_account",
    "empty identities (repeated signup)",
);

assert.equal(
    classifySignUpWithoutSession(null),
    "likely_existing_account",
    "missing user",
);

const repeatedMsg = buildSignUpNoSessionMessage({
    classification: "likely_existing_account",
    signupAccountType: "podcaster",
    creatorSelfSignupEnabled: true,
    foundingBetaLocked: true,
    hasPendingInviteCode: false,
});
assert.match(repeatedMsg, /may already be registered/i);
assert.match(repeatedMsg, /log in below/i);
assert.doesNotMatch(repeatedMsg, /account created/i);

const pendingMsg = buildSignUpNoSessionMessage({
    classification: "likely_pending_confirmation",
    signupAccountType: "listener",
    creatorSelfSignupEnabled: false,
    foundingBetaLocked: false,
    hasPendingInviteCode: false,
});
assert.match(pendingMsg, /if this is a new email address/i);
assert.match(pendingMsg, /confirmation link/i);
assert.doesNotMatch(pendingMsg, /^account created/i);

const creatorPending = buildSignUpNoSessionMessage({
    classification: "likely_pending_confirmation",
    signupAccountType: "artist",
    creatorSelfSignupEnabled: true,
    foundingBetaLocked: false,
    hasPendingInviteCode: false,
});
assert.match(creatorPending, /creator dashboard/i);

assert.equal(resolveSignUpClientErrorMessage({ message: "User already registered" }), "User already registered");
assert.equal(resolveSignUpClientErrorMessage(null), "Sign up failed. Please try again.");

assert.equal(
    resolveAuthTransportErrorMessage(new Error("Failed to fetch")),
    "Could not reach Supabase. Check your Supabase URL, anon key, internet connection, and allowed site URL settings.",
);
assert.equal(resolveAuthTransportErrorMessage(new Error("timeout")), "timeout");
assert.equal(
    resolveAuthTransportErrorMessage({}),
    "Something went wrong while connecting to Supabase. Please try again.",
);

console.log("signup-auth-response tests passed");
