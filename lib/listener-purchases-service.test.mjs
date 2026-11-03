import assert from "node:assert/strict";

function shortOrderNumber(id) {
    const clean = String(id || "").replace(/-/g, "").toUpperCase();
    if (clean.length >= 8) return `MDB-${clean.slice(0, 8)}`;
    return clean ? `MDB-${clean}` : "MDB-ORDER";
}

function isMarketplaceReceiptRow(row) {
    const status = String(row.status || "").trim().toLowerCase();
    if (status === "refunded") return true;
    if (status !== "completed") return false;
    const confirmedAt = String(row.payment_confirmed_at || "").trim();
    const paymentIntent = String(row.provider_payment_intent_id || "").trim();
    const checkoutSession = String(row.provider_checkout_session_id || "").trim();
    return Boolean(confirmedAt || paymentIntent || checkoutSession);
}

function isRingtoneReceiptRow(row) {
    return String(row.payment_status || "").trim().toLowerCase() === "paid";
}

const orderId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
assert.equal(shortOrderNumber(orderId), "MDB-A1B2C3D4");
assert.equal(shortOrderNumber(orderId), shortOrderNumber(orderId));
assert.equal(isMarketplaceReceiptRow({ status: "pending" }), false);
assert.equal(isMarketplaceReceiptRow({ status: "completed", payment_confirmed_at: "2026-01-01" }), true);
assert.equal(isRingtoneReceiptRow({ payment_status: "paid" }), true);

console.log("listener-purchases-service.test.mjs: ok");
