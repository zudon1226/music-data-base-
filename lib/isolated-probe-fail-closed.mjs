/** Pure helpers for isolated HTTP fail-closed expectations (no secrets). */

export function responseLooksLikeMedia(contentType) {
    const type = String(contentType || "").toLowerCase();
    return type.startsWith("audio/") || type.startsWith("video/");
}

export function evaluateFailClosedProbe(probe, { expectStatuses = [503], requireJsonCode = "" } = {}) {
    const statuses = Array.isArray(expectStatuses) ? expectStatuses : [expectStatuses];
    const statusOk = statuses.includes(probe.status);
    const noMedia = !probe.isMediaBody;
    let codeOk = true;
    if (requireJsonCode) {
        codeOk = String(probe.jsonCode || "") === requireJsonCode;
    }
    return {
        pass: statusOk && noMedia && codeOk,
        statusOk,
        noMedia,
        codeOk,
    };
}
