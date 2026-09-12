import { NextResponse } from "next/server";
import { getSignedSponsorAssetUrl, listActiveSponsorPlacements } from "@/lib/sponsor-service";
import { getErrorMessage } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const placement = new URL(request.url).searchParams.get("placement")?.trim() || "";
        const rows = await listActiveSponsorPlacements(placement || undefined);
        const now = Date.now();
        const active = rows.filter((row) => {
            const start = row.scheduled_start_at ? Date.parse(String(row.scheduled_start_at)) : 0;
            const end = row.scheduled_end_at ? Date.parse(String(row.scheduled_end_at)) : Number.POSITIVE_INFINITY;
            if (Number.isFinite(start) && start > now) return false;
            if (Number.isFinite(end) && end <= now) return false;
            return true;
        });

        const placements = await Promise.all(active.map(async (row) => {
            const assets = Array.isArray(row.sponsor_assets) ? row.sponsor_assets : [];
            const withUrls = await Promise.all(assets.map(async (asset: { storage_path?: string }) => {
                const path = String(asset.storage_path || "");
                if (!path) return { ...asset, signedUrl: null };
                try {
                    const signedUrl = await getSignedSponsorAssetUrl(path, 3600);
                    return { ...asset, signedUrl };
                } catch {
                    return { ...asset, signedUrl: null };
                }
            }));
            return { ...row, sponsor_assets: withUrls };
        }));

        return NextResponse.json({ placements });
    } catch (error) {
        console.error("[api/sponsors/placements] GET failed:", error);
        return NextResponse.json({ error: getErrorMessage(error), placements: [] }, { status: 500 });
    }
}
