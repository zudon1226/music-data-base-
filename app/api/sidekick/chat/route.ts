import { NextResponse } from "next/server";
import { parseSidekickHistoryFromBody } from "@/lib/sidekick/sidekick-conversation";
import {
    isSidekickOpenAIConfigured,
    requestSidekickOpenAIReply,
    SidekickProviderError,
} from "@/lib/sidekick/sidekick-openai-responses";
import { getSessionTokensFromRecord, resolveStrictRequestUserId } from "@/lib/request-auth";
import { getErrorMessage } from "@/lib/server-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 2A auth + validation; Phase 2C OpenAI Responses provider. */
const SIDEKICK_MAX_MESSAGE_LENGTH = 4000;

function jsonResponse(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

function parseMessage(body: Record<string, unknown>) {
    if (typeof body.message !== "string") {
        return { ok: false as const, error: "Message must be a string." };
    }
    const message = body.message.trim();
    if (!message) {
        return { ok: false as const, error: "Message is required." };
    }
    if (message.length > SIDEKICK_MAX_MESSAGE_LENGTH) {
        return {
            ok: false as const,
            error: `Message must be at most ${SIDEKICK_MAX_MESSAGE_LENGTH} characters.`,
        };
    }
    return { ok: true as const, message };
}

export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const tokens = getSessionTokensFromRecord(body);
        const resolved = await resolveStrictRequestUserId(request, tokens);
        if (!resolved.userId) {
            return jsonResponse(
                { error: resolved.error || "Sign in to use Sidekick." },
                401,
            );
        }

        const claimedUserId = typeof body.userId === "string"
            ? body.userId.trim()
            : typeof body.user_id === "string"
                ? body.user_id.trim()
                : "";
        if (claimedUserId && claimedUserId !== resolved.userId) {
            return jsonResponse(
                { error: "Authorization token does not match the requested user." },
                403,
            );
        }

        const parsed = parseMessage(body);
        if (!parsed.ok) {
            return jsonResponse({ error: parsed.error }, 400);
        }

        const parsedHistory = parseSidekickHistoryFromBody(body);
        if (!parsedHistory.ok) {
            return jsonResponse({ error: parsedHistory.error }, 400);
        }

        if (!isSidekickOpenAIConfigured()) {
            console.error("[api/sidekick/chat] OPENAI_API_KEY is not configured");
            return jsonResponse(
                { error: "Sidekick is not configured." },
                503,
            );
        }

        const reply = await requestSidekickOpenAIReply(parsed.message, parsedHistory.history);

        return jsonResponse({
            ok: true,
            reply,
        });
    }
    catch (error) {
        if (error instanceof SidekickProviderError) {
            const status = error.code === "not_configured" ? 503 : 502;
            return jsonResponse({ error: error.message }, status);
        }
        console.error("[api/sidekick/chat] POST failed:", error);
        return jsonResponse({ error: getErrorMessage(error) }, 500);
    }
}

export async function GET() {
    return jsonResponse({ error: "Method not allowed." }, 405);
}
