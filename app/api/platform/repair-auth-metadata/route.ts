import { NextResponse } from "next/server";
import {
    handleRepairMetadataError,
    handleRepairMetadataGet,
    handleRepairMetadataPost,
} from "@/lib/repair-metadata-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET() {
    const result = handleRepairMetadataGet();
    return jsonResponse({
        ...result.body,
        route: "/api/platform/repair-auth-metadata",
    }, result.status);
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const result = await handleRepairMetadataPost(body);
        return jsonResponse(result.body, result.status);
    }
    catch (error) {
        const result = handleRepairMetadataError(error);
        return jsonResponse(result.body, result.status);
    }
}
