/** Sidekick — OpenAI Responses API (server-only). */

import {
    buildResponsesApiInputFromConversation,
    type SidekickConversationTurn,
} from "@/lib/sidekick/sidekick-conversation";
import { buildSidekickInstructions } from "@/lib/sidekick/sidekick-mdb-knowledge";

/** Appended after frozen Phase 2D instructions; does not modify sidekick-mdb-knowledge.ts */
const SIDEKICK_SESSION_DIALOGUE_NOTE =
    "Earlier items in input (if any) are this user's current Sidekick session dialogue only. Use them for follow-up pronouns and topic continuity. They are not authoritative MDB facts—AUTHORITATIVE MDB FACTS in instructions still govern all product claims.";

export const SIDEKICK_OPENAI_MODEL = "gpt-4o-mini";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const SIDEKICK_PROVIDER_TIMEOUT_MS = 60_000;

type ResponsesOutputItem = {
    type?: string;
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
};

type OpenAIResponsesPayload = {
    error?: { message?: string };
    output?: ResponsesOutputItem[];
    output_text?: string;
};

function readOpenAIApiKey() {
    return String(process.env.OPENAI_API_KEY || "").trim();
}

export function isSidekickOpenAIConfigured() {
    return readOpenAIApiKey().length > 0;
}

export function extractAssistantTextFromResponses(payload: OpenAIResponsesPayload): string {
    if (typeof payload.output_text === "string" && payload.output_text.trim()) {
        return payload.output_text.trim();
    }

    const parts: string[] = [];
    for (const item of payload.output ?? []) {
        if (item.type !== "message" || item.role !== "assistant") {
            continue;
        }
        for (const block of item.content ?? []) {
            if (block.type === "output_text" && typeof block.text === "string" && block.text.trim()) {
                parts.push(block.text.trim());
            }
        }
    }

    return parts.join("\n\n").trim();
}

export async function requestSidekickOpenAIReply(
    userMessage: string,
    history: SidekickConversationTurn[] = [],
): Promise<string> {
    const apiKey = readOpenAIApiKey();
    if (!apiKey) {
        throw new SidekickProviderError("Sidekick is not configured.", "not_configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SIDEKICK_PROVIDER_TIMEOUT_MS);

    try {
        const response = await fetch(OPENAI_RESPONSES_URL, {
            method: "POST",
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: SIDEKICK_OPENAI_MODEL,
                instructions: `${buildSidekickInstructions()}\n\n${SIDEKICK_SESSION_DIALOGUE_NOTE}`,
                input: buildResponsesApiInputFromConversation(history, userMessage),
            }),
        });

        const payload = (await response.json().catch(() => ({}))) as OpenAIResponsesPayload;

        if (!response.ok) {
            console.error("[sidekick/openai] Responses API rejected request", {
                status: response.status,
            });
            throw new SidekickProviderError(
                "Sidekick could not complete your request. Please try again.",
                "provider_error",
            );
        }

        const reply = extractAssistantTextFromResponses(payload);
        if (!reply) {
            console.error("[sidekick/openai] Responses API returned no assistant text");
            throw new SidekickProviderError(
                "Sidekick returned an empty response. Please try again.",
                "empty_reply",
            );
        }

        return reply;
    }
    catch (error) {
        if (error instanceof SidekickProviderError) {
            throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
            console.error("[sidekick/openai] Responses API timed out");
            throw new SidekickProviderError(
                "Sidekick took too long to respond. Please try again.",
                "timeout",
            );
        }
        console.error("[sidekick/openai] Responses API request failed");
        throw new SidekickProviderError(
            "Sidekick could not complete your request. Please try again.",
            "provider_error",
        );
    }
    finally {
        clearTimeout(timeout);
    }
}

export class SidekickProviderError extends Error {
    readonly code: "not_configured" | "provider_error" | "empty_reply" | "timeout";

    constructor(message: string, code: SidekickProviderError["code"]) {
        super(message);
        this.name = "SidekickProviderError";
        this.code = code;
    }
}
