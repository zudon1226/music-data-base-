import { requireMixtapeRequestUser } from "@/lib/mixtape-route-auth";
import { isPlatformAdminUserId } from "@/lib/platform-admin";

export async function requireMixtapeReportModerator(
    request: Request,
    body: Record<string, unknown>,
    route: string,
) {
    const auth = await requireMixtapeRequestUser(request, body, route);
    if (!auth.ok) return auth;
    if (!(await isPlatformAdminUserId(auth.userId))) {
        return {
            ok: false as const,
            status: 403 as const,
            error: "Platform admin permission is required.",
        };
    }
    return auth;
}