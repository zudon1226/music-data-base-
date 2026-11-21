/**
 * Reorder helpers for mixtape_tracks unique (mixtape_id, position).
 */

export type MixtapeTrackPositionPlan =
    | { ok: false; error: string }
    | { ok: true; kind: "noop" }
    | { ok: true; kind: "move"; newPosition: number }
    | {
          ok: true;
          kind: "swap";
          tempPosition: number;
          occupantTrackId: string;
          occupantNewPosition: number;
          newPosition: number;
      };

export function planMixtapeTrackPositionSwap(params: {
    oldPosition: number;
    newPosition: number;
    occupantTrackId: string;
}): MixtapeTrackPositionPlan {
    const oldPos = Number(params.oldPosition);
    const newPos = Number(params.newPosition);
    const occupantTrackId = params.occupantTrackId;
    if (!Number.isInteger(newPos) || newPos < 1) {
        return { ok: false, error: "Track position must be 1 or greater." };
    }
    if (oldPos === newPos) {
        return { ok: true, kind: "noop" };
    }
    if (!occupantTrackId) {
        return { ok: true, kind: "move", newPosition: newPos };
    }
    return {
        ok: true,
        kind: "swap",
        tempPosition: Math.max(oldPos, newPos) + 1,
        occupantTrackId: String(occupantTrackId),
        occupantNewPosition: oldPos,
        newPosition: newPos,
    };
}