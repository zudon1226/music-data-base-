/** Sidekick ephemeral conversation turns (validated server-side). */

export const SIDEKICK_HISTORY_MAX_TURNS = 6;
export const SIDEKICK_HISTORY_MAX_CONTENT_LENGTH = 4000;

export type SidekickConversationRole = "user" | "assistant";

export type SidekickConversationTurn = {
    role: SidekickConversationRole;
    content: string;
};

function isConversationRole(value: unknown): value is SidekickConversationRole {
    return value === "user" || value === "assistant";
}

export function parseSidekickHistoryFromBody(body: Record<string, unknown>):
    | { ok: true; history: SidekickConversationTurn[] }
    | { ok: false; error: string } {
    if (body.history === undefined || body.history === null) {
        return { ok: true, history: [] };
    }

    if (!Array.isArray(body.history)) {
        return { ok: false, error: "History must be an array." };
    }

    if (body.history.length > SIDEKICK_HISTORY_MAX_TURNS) {
        return {
            ok: false,
            error: `History must contain at most ${SIDEKICK_HISTORY_MAX_TURNS} prior messages.`,
        };
    }

    const history: SidekickConversationTurn[] = [];

    for (const item of body.history) {
        if (!item || typeof item !== "object") {
            return { ok: false, error: "Each history item must be an object." };
        }
        const record = item as Record<string, unknown>;
        if (!isConversationRole(record.role)) {
            return { ok: false, error: "History role must be user or assistant." };
        }
        if (typeof record.content !== "string") {
            return { ok: false, error: "History content must be a string." };
        }
        const content = record.content.trim();
        if (!content) {
            return { ok: false, error: "History content cannot be empty." };
        }
        if (content.length > SIDEKICK_HISTORY_MAX_CONTENT_LENGTH) {
            return {
                ok: false,
                error: `Each history message must be at most ${SIDEKICK_HISTORY_MAX_CONTENT_LENGTH} characters.`,
            };
        }
        history.push({ role: record.role, content });
    }

    return { ok: true, history };
}

export function buildResponsesApiInputFromConversation(
    history: SidekickConversationTurn[],
    userMessage: string,
): Array<{ role: SidekickConversationRole; content: string }> {
    return [
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: userMessage },
    ];
}
