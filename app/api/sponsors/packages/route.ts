import { NextResponse } from "next/server";
import { listActiveSponsorPackages } from "@/lib/sponsor-service";
import { getErrorMessage } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const packages = await listActiveSponsorPackages();
        return NextResponse.json({ packages });
    } catch (error) {
        console.error("[api/sponsors/packages] GET failed:", error);
        return NextResponse.json({ error: getErrorMessage(error), packages: [] }, { status: 500 });
    }
}
