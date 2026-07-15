import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { evaluateFoundingApiAccess } from "@/lib/founding-api-access-server";

/** DESKTOP ONLY — edge proxy runs ONLY on repair-metadata routes.
 * Supabase Auth (/auth/v1/*) is never proxied; browser talks to *.supabase.co directly.
 * App API routes under /api/* (except the two matchers below) are also excluded.
 */
const REPAIR_METADATA_PATHS = new Set([
    "/api/auth/repair-metadata",
    "/api/platform/repair-auth-metadata",
]);

const STRIPPED_REPAIR_HEADERS = [
    "authorization",
    "Authorization",
    "x-supabase-refresh-token",
    "X-Supabase-Refresh-Token",
    "apikey",
    "x-supabase-auth",
] as const;

function stripRepairMetadataRequestHeaders(request: NextRequest) {
    const headers = new Headers(request.headers);
    STRIPPED_REPAIR_HEADERS.forEach((headerName) => {
        headers.delete(headerName);
    });
    return headers;
}

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    const foundingAccess = await evaluateFoundingApiAccess(request, pathname);
    if (!foundingAccess.ok) {
        return NextResponse.json({
            error: foundingAccess.error,
            foundingAccessDenied: true,
        }, { status: foundingAccess.status });
    }

    if (!REPAIR_METADATA_PATHS.has(pathname)) {
        return NextResponse.next();
    }

    return NextResponse.next({
        request: {
            headers: stripRepairMetadataRequestHeaders(request),
        },
    });
}

export const config = {
    matcher: [
        "/api/:path*",
        "/api/auth/repair-metadata",
        "/api/platform/repair-auth-metadata",
    ],
};
