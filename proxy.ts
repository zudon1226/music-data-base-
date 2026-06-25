import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** DESKTOP ONLY — edge proxy excludes API/auth/static routes from all auth handling. */
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

export function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

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
        /*
         * Run ONLY on public repair-metadata routes.
         * Excluded from this proxy entirely:
         * - /api/*
         * - /auth/*
         * - /_next/*
         * - static assets (files with extensions)
         */
        "/api/auth/repair-metadata",
        "/api/platform/repair-auth-metadata",
    ],
};
