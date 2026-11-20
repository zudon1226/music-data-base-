/**
 * Staging engagement fixture archive guards and API cleanup (no secrets logged).
 */
export const PRESERVED_MIXTAPE_ID = "6666f776-dafa-4551-ba36-dd302962844a";
export const ENGAGEMENT_TITLE_PREFIX = "mdb-engagement-long-";
export const E2E_ARTIST_ID = "f0502a2e-d27b-42fc-99ee-78dddcf89fe0";
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidEngagementFixtureMetadata(fixture) {
    if (!fixture || typeof fixture !== "object") return { ok: false, reason: "fixture missing" };
    const mixtapeId = String(fixture.mixtapeId || "");
    const title = String(fixture.title || "");
    const ownerUserId = String(fixture.ownerUserId || "");
    if (mixtapeId === PRESERVED_MIXTAPE_ID) return { ok: false, reason: "preserved fixture id blocked" };
    if (!UUID_RE.test(mixtapeId)) return { ok: false, reason: "invalid mixtape id" };
    if (!title.startsWith(ENGAGEMENT_TITLE_PREFIX)) return { ok: false, reason: "invalid title prefix" };
    if (ownerUserId !== E2E_ARTIST_ID) return { ok: false, reason: "wrong owner" };
    return { ok: true, mixtapeId, title, ownerUserId };
}

export function isSafeEngagementArchiveTarget(fixture, runFixture) {
    const meta = isValidEngagementFixtureMetadata(fixture);
    if (!meta.ok) return { ok: false, reason: meta.reason };
    if (!runFixture || typeof runFixture !== "object") return { ok: false, reason: "run fixture pin missing" };
    if (String(runFixture.mixtapeId) !== meta.mixtapeId) return { ok: false, reason: "mixtape id does not match run pin" };
    if (String(runFixture.title) !== meta.title) return { ok: false, reason: "title does not match run pin" };
    if (String(runFixture.ownerUserId || "") !== E2E_ARTIST_ID) return { ok: false, reason: "run owner mismatch" };
    return { ok: true, mixtapeId: meta.mixtapeId, title: meta.title };
}

export async function readGuestMixtapePublicState(baseUrl, mixtapeId) {
    if (!UUID_RE.test(String(mixtapeId || ""))) {
        return { httpStatus: 0, publiclyAvailable: false, mixtapeStatus: "", error: "invalid id" };
    }
    const res = await fetch(`${String(baseUrl).replace(/\/$/, "")}/api/mixtapes/${mixtapeId}`);
    const json = await res.json().catch(() => ({}));
    const status = String(json.mixtape?.status || json.status || "");
    const publiclyAvailable = res.ok && status === "published";
    return { httpStatus: res.status, publiclyAvailable, mixtapeStatus: status, error: json.error ? String(json.error) : "" };
}

/**
 * Archive via creator DELETE /api/mixtapes/:id (requires Bearer + userId in body).
 */
export async function archiveEngagementFixtureViaApi({ baseUrl, accessToken, userId, fixture, runFixture }) {
    const guard = isSafeEngagementArchiveTarget(fixture, runFixture);
    if (!guard.ok) {
        return { ok: false, archived: false, reason: guard.reason, verify: null };
    }
    if (userId !== E2E_ARTIST_ID) {
        return { ok: false, archived: false, reason: "authenticated user is not engagement owner", verify: null };
    }
    const mixtapeId = guard.mixtapeId;
    const res = await fetch(`${String(baseUrl).replace(/\/$/, "")}/api/mixtapes/${mixtapeId}`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.archived !== true) {
        return {
            ok: false,
            archived: false,
            reason: body.error ? String(body.error) : `http_${res.status}`,
            verify: null,
            httpStatus: res.status,
        };
    }
    const verify = await readGuestMixtapePublicState(baseUrl, mixtapeId);
    const verified = !verify.publiclyAvailable;
    return {
        ok: verified,
        archived: true,
        reason: verified ? "" : `still publicly available (http=${verify.httpStatus} status=${verify.mixtapeStatus})`,
        verify,
        httpStatus: res.status,
        mixtapeId,
        title: guard.title,
    };
}