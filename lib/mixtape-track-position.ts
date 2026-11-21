import type { SupabaseClient } from "@supabase/supabase-js";
import { planMixtapeTrackPositionSwap } from "@/lib/mixtape-track-position-plan";
import { getErrorMessage } from "@/lib/server-supabase";

const TRACK_POSITION_COLUMNS = "id,mixtape_id,position";

export async function applyMixtapeTrackPositionChange(
    supabase: SupabaseClient,
    trackId: string,
    trackRow: Record<string, unknown>,
    newPosition: number,
): Promise<{ ok: true; position: number } | { ok: false; error: string }> {
    const mixtapeId = String(trackRow.mixtape_id || "");
    const oldPosition = Number(trackRow.position);
    const occupantResult = await supabase
        .from("mixtape_tracks")
        .select("id")
        .eq("mixtape_id", mixtapeId)
        .eq("position", newPosition)
        .neq("id", trackId)
        .maybeSingle();
    if (occupantResult.error) {
        return { ok: false, error: getErrorMessage(occupantResult.error) };
    }
    const plan = planMixtapeTrackPositionSwap({
        oldPosition,
        newPosition,
        occupantTrackId: occupantResult.data?.id ? String(occupantResult.data.id) : "",
    });
    if (!plan.ok) {
        return { ok: false, error: plan.error };
    }
    if (plan.kind === "noop") {
        return { ok: true, position: oldPosition };
    }
    if (plan.kind === "move") {
        const moved = await supabase
            .from("mixtape_tracks")
            .update({ position: plan.newPosition })
            .eq("id", trackId)
            .select(TRACK_POSITION_COLUMNS)
            .single();
        if (moved.error) return { ok: false, error: getErrorMessage(moved.error) };
        return { ok: true, position: plan.newPosition };
    }
    const toTemp = await supabase
        .from("mixtape_tracks")
        .update({ position: plan.tempPosition })
        .eq("id", trackId);
    if (toTemp.error) return { ok: false, error: getErrorMessage(toTemp.error) };
    const shiftOccupant = await supabase
        .from("mixtape_tracks")
        .update({ position: plan.occupantNewPosition })
        .eq("id", plan.occupantTrackId);
    if (shiftOccupant.error) return { ok: false, error: getErrorMessage(shiftOccupant.error) };
    const finalize = await supabase
        .from("mixtape_tracks")
        .update({ position: plan.newPosition })
        .eq("id", trackId);
    if (finalize.error) return { ok: false, error: getErrorMessage(finalize.error) };
    return { ok: true, position: plan.newPosition };
}