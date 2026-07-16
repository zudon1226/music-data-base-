/**
 * Secure server-side ringtone processing design (Phase 1 foundation).
 *
 * Browser-only fake conversion is intentionally unsupported.
 * Clip rendering must run in a trusted Node/server worker with ffmpeg (or
 * equivalent) using the private ringtone-source object as input.
 *
 * Pipeline:
 * 1. Creator uploads authorized source audio to ringtone-source/{userId}/{uuid}.ext
 *    OR selects an owned song and the server copies/references that private source.
 * 2. Server validates MIME, size, ownership, and 15–30s clip window.
 * 3. Worker extracts exactly [clipStart, clipEnd] into:
 *    - ringtone-previews/{userId}/{uuid}-preview.m4a|mp3  (public/signed preview)
 *    - ringtone-downloads/{userId}/{uuid}-android.mp3     (private purchase file)
 *    - ringtone-downloads/{userId}/{uuid}-iphone.m4a      (private AAC/M4A)
 * 4. Original source song rows and storage objects remain unchanged.
 * 5. Status moves draft -> processing -> pending_review (or rejected on failure).
 *
 * iPhone:
 * - Max 30 seconds, AAC-compatible (.m4a) downloadable artifact
 * - Installation is documented via Files + GarageBand; the web app never claims
 *   it can set the device ringtone directly.
 *
 * Android:
 * - Max 30 seconds, MP3 (or compatible) downloadable artifact
 * - Installation instructions are provided in-product copy.
 */

import { randomUUID } from "node:crypto";
import {
    RINGTONE_MAX_DURATION_SECONDS,
    RINGTONE_STORAGE_BUCKETS,
} from "@/lib/ringtone-constants";

export type RingtoneProcessJob = {
    ringtoneId: string;
    creatorId: string;
    sourceBucket: string;
    sourcePath: string;
    clipStartSeconds: number;
    clipEndSeconds: number;
    durationSeconds: number;
};

export type RingtoneProcessPlan = {
    ok: true;
    job: RingtoneProcessJob;
    previewPath: string;
    androidPath: string;
    iphonePath: string;
    previewBucket: string;
    downloadBucket: string;
    notes: string[];
} | {
    ok: false;
    error: string;
};

function safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

/** Non-guessable owner-scoped object key. */
export function buildRingtoneStoragePath(userId: string, label: string, extension: string) {
    const ext = extension.replace(/^\./, "").toLowerCase() || "bin";
    return `${userId}/${randomUUID()}-${safeSegment(label)}.${ext}`;
}

export function planRingtoneProcessing(input: {
    ringtoneId: string;
    creatorId: string;
    sourceBucket: string;
    sourcePath: string;
    clipStartSeconds: number;
    clipEndSeconds: number;
    durationSeconds: number;
}): RingtoneProcessPlan {
    if (!input.ringtoneId || !input.creatorId) {
        return { ok: false, error: "ringtoneId and creatorId are required." };
    }
    if (!input.sourceBucket || !input.sourcePath) {
        return { ok: false, error: "Source storage location is required." };
    }
    if (input.durationSeconds > RINGTONE_MAX_DURATION_SECONDS) {
        return { ok: false, error: "Processing refuses clips longer than 30 seconds." };
    }
    if (!input.sourcePath.startsWith(`${input.creatorId}/`)) {
        return { ok: false, error: "Source path must be owner-scoped under the creator id." };
    }

    const previewPath = buildRingtoneStoragePath(input.creatorId, "preview", "m4a");
    const androidPath = buildRingtoneStoragePath(input.creatorId, "android", "mp3");
    const iphonePath = buildRingtoneStoragePath(input.creatorId, "iphone", "m4a");

    return {
        ok: true,
        job: {
            ringtoneId: input.ringtoneId,
            creatorId: input.creatorId,
            sourceBucket: input.sourceBucket,
            sourcePath: input.sourcePath,
            clipStartSeconds: input.clipStartSeconds,
            clipEndSeconds: input.clipEndSeconds,
            durationSeconds: input.durationSeconds,
        },
        previewPath,
        androidPath,
        iphonePath,
        previewBucket: RINGTONE_STORAGE_BUCKETS.previews,
        downloadBucket: RINGTONE_STORAGE_BUCKETS.downloads,
        notes: [
            "Use server-side ffmpeg (or equivalent) only; never convert in the browser.",
            "Preserve the original source song/object unchanged.",
            "Write preview to ringtone-previews and purchase files to ringtone-downloads.",
            "iPhone artifact must be AAC-compatible M4A; Android artifact must be MP3-compatible.",
            "Do not claim the web app can directly assign an iPhone ringtone.",
        ],
    };
}

/**
 * Placeholder for the future worker entrypoint. Phase 1 ships the contract only.
 * Calling this throws so no route accidentally pretends conversion succeeded.
 */
export async function executeRingtoneProcessingJob(_job: RingtoneProcessJob): Promise<never> {
    throw new Error(
        "Ringtone processing worker is not enabled in Phase 1. Queue the job with planRingtoneProcessing() and process it server-side with ffmpeg.",
    );
}
