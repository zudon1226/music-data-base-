import { podcastShareUrl } from "@/lib/podcast-routes";

export type PodcastShareKind = "show" | "episode";
export type PodcastShareResult = "shared" | "copied" | "prompted" | "canceled";

function isShareCancellation(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const name = "name" in error ? String((error as { name?: string }).name) : "";
    const message = "message" in error ? String((error as { message?: string }).message) : "";
    return name === "AbortError" || /share canceled|share cancelled|abort/i.test(message);
}

export async function sharePodcastLink(input: {
    kind: PodcastShareKind;
    id: string;
    title: string;
    text: string;
}): Promise<PodcastShareResult> {
    const url = podcastShareUrl(input.kind, input.id);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
            await navigator.share({
                title: input.title,
                text: input.text,
                url,
            });
            return "shared";
        }
        catch (error) {
            if (isShareCancellation(error)) return "canceled";
        }
    }

    try {
        await navigator.clipboard.writeText(url);
        return "copied";
    }
    catch {
        if (typeof window !== "undefined") {
            window.prompt("Copy this link", url);
        }
        return "prompted";
    }
}
