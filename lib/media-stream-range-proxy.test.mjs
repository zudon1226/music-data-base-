import assert from "node:assert/strict";
import { proxyMediaStreamWithRange } from "./media-stream-range-proxy.ts";

const originalFetch = globalThis.fetch;

try {
    globalThis.fetch = async (_url, init) => {
        assert.equal(init?.headers?.Range, "bytes=0-1");
        return new Response(Uint8Array.from([0, 1]), {
            status: 206,
            headers: {
                "content-range": "bytes 0-1/100",
                "content-length": "2",
            },
        });
    };

    const request = new Request("http://localhost/test", {
        headers: { Range: "bytes=0-1" },
    });
    const result = await proxyMediaStreamWithRange("http://upstream.example/media.mp4", request, "video/mp4");
    assert.equal(result.ok, true);
    assert.equal(result.status, 206);
    assert.equal(result.headers.get("Accept-Ranges"), "bytes");
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(result.headers.get("Content-Type"), "video/mp4");
    assert.equal(result.headers.get("content-range"), "bytes 0-1/100");

    console.log("media-stream-range-proxy tests passed.");
}
finally {
    globalThis.fetch = originalFetch;
}
