import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_REPAIR_PATHS = new Set([
    "/api/auth/repair-metadata",
    "/api/platform/repair-auth-metadata",
]);

function stripSessionHeaders(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.delete("Authorization");
    headers.delete("x-supabase-refresh-token");
    headers.delete("X-Supabase-Refresh-Token");
    headers.delete("apikey");
    headers.delete("x-supabase-auth");
    return headers;
}

export function proxy(request: NextRequest) {
    if (!PUBLIC_REPAIR_PATHS.has(request.nextUrl.pathname)) {
        return NextResponse.next();
    }

    return NextResponse.next({
        request: {
            headers: stripSessionHeaders(request),
        },
    });
}

export const config = {
    matcher: [
        "/api/auth/repair-metadata",
        "/api/platform/repair-auth-metadata",
    ],
};
