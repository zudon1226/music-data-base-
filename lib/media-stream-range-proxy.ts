/**
 * Proxy upstream media bytes with optional HTTP Range support (Safari/video seeking).
 * Upstream URL must already be authorized server-side; never expose upstream URL to clients.
 */
export async function proxyMediaStreamWithRange(
    upstreamUrl: string,
    request: Request,
    contentType: string,
) {
    const rangeHeader = request.headers.get("range");
    const upstream = await fetch(upstreamUrl, {
        cache: "no-store",
        headers: rangeHeader ? { Range: rangeHeader } : undefined,
    });

    if (!upstream.ok && upstream.status !== 206) {
        return {
            ok: false as const,
            status: upstream.status,
            error: `Upstream media fetch failed with HTTP ${upstream.status}.`,
        };
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, no-store");
    headers.set("Accept-Ranges", "bytes");

    const passThrough = [
        "content-range",
        "content-length",
    ] as const;
    for (const key of passThrough) {
        const value = upstream.headers.get(key);
        if (value) headers.set(key, value);
    }

    return {
        ok: true as const,
        status: upstream.status,
        headers,
        body: upstream.body,
    };
}
