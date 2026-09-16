import { NextResponse } from "next/server";
import { registerListenerLaunchNotify } from "@/lib/launch-listener-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
    return NextResponse.json(body, { status });
}

/** Public listener launch notify — email only, no auth, no Stripe. */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        if (typeof body.website === "string" && body.website.trim()) {
            return json({ ok: true, duplicate: false });
        }

        const email = body.email;
        const result = await registerListenerLaunchNotify(String(email || ""));

        if (!result.ok) {
            return json(
                {
                    ok: false,
                    error: result.error,
                    setupRequired: result.setupRequired === true,
                },
                result.status,
            );
        }

        return json({
            ok: true,
            duplicate: result.duplicate === true,
            message: result.duplicate
                ? "This email is already registered for launch updates."
                : "Thanks! We will notify you when Music Data Base launches.",
        });
    }
    catch (error) {
        console.error("[api/launch/listener-notify] POST failed:", error);
        return json({ ok: false, error: "Could not save your notification request." }, 500);
    }
}

export async function GET() {
    return json({ error: "Method not allowed." }, 405);
}
