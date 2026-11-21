/**
 * Reorder helpers for mixtape_tracks unique (mixtape_id, position).
 */

export function planMixtapeTrackPositionSwap({ oldPosition, newPosition, occupantTrackId }) {
    const oldPos = Number(oldPosition);
    const newPos = Number(newPosition);
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