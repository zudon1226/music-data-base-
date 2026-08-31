import { timingSafeEqual } from "node:crypto";

function readCronSecret() {
    return String(process.env.CRON_SECRET || "").trim();
}

function readBearerToken(request: Request) {
    const authorization = request.headers.get("authorization") || "";
    const [scheme, token] = authorization.split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) return "";
    return token.trim();
}

/** Vercel Cron sends Authorization: Bearer $CRON_SECRET. Never expose this to the client. */
export function isAuthorizedCronRequest(request: Request) {
    const secret = readCronSecret();
    if (!secret) return false;
    const token = readBearerToken(request);
    if (!token) return false;
    const expected = Buffer.from(secret);
    const received = Buffer.from(token);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
}
