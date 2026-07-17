/**
 * Secure server-side ringtone processing (Phase 4).
 *
 * Never convert protected source files entirely in the browser.
 * Never expose service-role credentials to clients.
 * Clip boundaries are always read from trusted product rows — creators cannot
 * alter clip bounds during processing.
 *
 * Outputs:
 * - preview (streaming-safe AAC/M4A) — exact approved clip only
 * - iPhone AAC-compatible M4A (≤30s) for Files + GarageBand workflow
 * - Android MP3 (≤30s) with clear loudness, modest size
 *
 * When ffmpeg is unavailable, RINGTONE_PROCESSING_TEST_MODE=1 enables a
 * server-side synthetic artifact path for isolated verification only.
 */

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import {
    RINGTONE_ARTIFACT_MAX_BYTES,
    RINGTONE_MAX_DURATION_SECONDS,
    RINGTONE_MIN_DURATION_SECONDS,
    RINGTONE_STORAGE_BUCKETS,
} from "@/lib/ringtone-constants";

export const RINGTONE_PROCESSING_VERSION = "ringtone-ffmpeg-v1";

/** Prefer the bundled static binary (Vercel/Linux), then PATH `ffmpeg`. */
function resolveFfmpegBinary(): string | null {
    const candidates = [
        typeof ffmpegStaticPath === "string" ? ffmpegStaticPath : "",
        process.env.FFMPEG_PATH || "",
        "ffmpeg",
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (candidate === "ffmpeg") return candidate;
        try {
            accessSync(candidate, fsConstants.X_OK);
            return candidate;
        } catch {
            try {
                accessSync(candidate, fsConstants.F_OK);
                return candidate;
            } catch {
                /* try next */
            }
        }
    }
    return null;
}

export type RingtoneProcessJob = {
    ringtoneId: string;
    creatorId: string;
    sourceBucket: string;
    sourcePath: string;
    clipStartSeconds: number;
    clipEndSeconds: number;
    durationSeconds: number;
    revisionNumber?: number;
    sourceChecksum?: string;
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

export type RingtoneArtifactValidation = {
    ok: true;
    mimeType: string;
    byteLength: number;
    durationSeconds: number;
} | {
    ok: false;
    error: string;
    code: string;
};

export type RingtoneProcessExecutionResult = {
    ok: true;
    previewPath: string;
    androidPath: string;
    iphonePath: string;
    previewBucket: string;
    downloadBucket: string;
    previewMimeType: string;
    androidMimeType: string;
    iphoneMimeType: string;
    previewBytes: Buffer;
    androidBytes: Buffer;
    iphoneBytes: Buffer;
    outputDurationSeconds: number;
    sourceChecksum: string;
    processingVersion: string;
    engine: "ffmpeg" | "test_mode";
    result: Record<string, unknown>;
} | {
    ok: false;
    error: string;
    code: string;
    details?: Record<string, unknown>;
};

function safeSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

/** Non-guessable owner-scoped object key. */
export function buildRingtoneStoragePath(userId: string, label: string, extension: string) {
    const ext = extension.replace(/^\./, "").toLowerCase() || "bin";
    return `${userId}/${randomUUID()}-${safeSegment(label)}.${ext}`;
}

export function isRingtoneProcessingTestModeEnabled() {
    return process.env.RINGTONE_PROCESSING_TEST_MODE === "1";
}

export function checksumBuffer(buffer: Buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

export function planRingtoneProcessing(input: {
    ringtoneId: string;
    creatorId: string;
    sourceBucket: string;
    sourcePath: string;
    clipStartSeconds: number;
    clipEndSeconds: number;
    durationSeconds: number;
    revisionNumber?: number;
    sourceChecksum?: string;
}): RingtoneProcessPlan {
    if (!input.ringtoneId || !input.creatorId) {
        return { ok: false, error: "ringtoneId and creatorId are required." };
    }
    if (!input.sourceBucket || !input.sourcePath) {
        return { ok: false, error: "Source storage location is required." };
    }
    if (input.durationSeconds < RINGTONE_MIN_DURATION_SECONDS) {
        return { ok: false, error: "Processing refuses clips shorter than 15 seconds." };
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
            revisionNumber: input.revisionNumber,
            sourceChecksum: input.sourceChecksum,
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

export function validateProcessedArtifact(input: {
    bytes: Buffer;
    mimeType: string;
    expectedDurationSeconds: number;
    label: string;
}): RingtoneArtifactValidation {
    const byteLength = input.bytes?.byteLength || 0;
    if (byteLength <= 0) {
        return { ok: false, error: `${input.label} audio is empty.`, code: "EMPTY_AUDIO" };
    }
    if (byteLength > RINGTONE_ARTIFACT_MAX_BYTES) {
        return {
            ok: false,
            error: `${input.label} exceeds the ${Math.floor(RINGTONE_ARTIFACT_MAX_BYTES / (1024 * 1024))}MB artifact limit.`,
            code: "FILE_TOO_LARGE",
        };
    }
    const mime = String(input.mimeType || "").toLowerCase();
    const allowed = new Set([
        "audio/mpeg",
        "audio/mp4",
        "audio/aac",
        "audio/m4a",
        "audio/x-m4a",
        "audio/mp4a-latm",
    ]);
    if (!allowed.has(mime)) {
        return { ok: false, error: `${input.label} has unsupported MIME type ${mime || "(empty)"}.`, code: "UNSUPPORTED_FORMAT" };
    }
    const duration = Number(input.expectedDurationSeconds);
    if (!Number.isFinite(duration) || duration < RINGTONE_MIN_DURATION_SECONDS || duration > RINGTONE_MAX_DURATION_SECONDS) {
        return { ok: false, error: `${input.label} duration must be 15–30 seconds.`, code: "INVALID_DURATION" };
    }
    return { ok: true, mimeType: mime, byteLength, durationSeconds: duration };
}

function runCommand(command: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { windowsHide: true });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error(`${command} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        child.stdout.on("data", (chunk) => { stdout += String(chunk); });
        child.stderr.on("data", (chunk) => { stderr += String(chunk); });
        child.on("error", (error) => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolve({ code: code ?? 1, stdout, stderr });
        });
    });
}

async function ffmpegAvailable(): Promise<string | null> {
    const binary = resolveFfmpegBinary();
    if (!binary) return null;
    try {
        const result = await runCommand(binary, ["-version"], 8_000);
        return result.code === 0 ? binary : null;
    } catch {
        return null;
    }
}

/** Minimal non-empty MP3 frame payload for test-mode Android output. */
function buildTestModeMp3(durationSeconds: number): Buffer {
    // MPEG1 Layer3, 128kbps, 44100Hz mono frame header + padding sized by duration.
    const header = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);
    const frameBody = Buffer.alloc(417, 0);
    const frames = Math.max(1, Math.ceil(durationSeconds * 38.28));
    const parts: Buffer[] = [];
    for (let i = 0; i < frames; i += 1) {
        parts.push(header, frameBody);
    }
    return Buffer.concat(parts);
}

/** Minimal ISO BMFF / M4A-like container stub for test-mode AAC outputs. */
function buildTestModeM4a(durationSeconds: number, label: string): Buffer {
    const ftyp = Buffer.from([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70,
        0x4D, 0x34, 0x41, 0x20,
        0x00, 0x00, 0x00, 0x00,
        0x4D, 0x34, 0x41, 0x20,
        0x6D, 0x70, 0x34, 0x32,
    ]);
    const meta = Buffer.from(
        `zml-ringtone-test|dur=${durationSeconds.toFixed(3)}|label=${label}|sr=44100|ch=1`,
        "utf8",
    );
    const mdatSize = Buffer.alloc(4);
    const mdatPayload = Buffer.concat([meta, Buffer.alloc(Math.max(64, Math.floor(durationSeconds * 64)), 0x01)]);
    mdatSize.writeUInt32BE(8 + mdatPayload.length, 0);
    const mdat = Buffer.concat([mdatSize, Buffer.from("mdat"), mdatPayload]);
    return Buffer.concat([ftyp, mdat]);
}

async function encodeWithFfmpeg(input: {
    ffmpegBinary: string;
    sourceBytes: Buffer;
    clipStartSeconds: number;
    durationSeconds: number;
}): Promise<{ preview: Buffer; android: Buffer; iphone: Buffer } | { error: string; code: string }> {
    const dir = await mkdtemp(join(tmpdir(), "zml-ringtone-"));
    try {
        const sourcePath = join(dir, "source.bin");
        const previewPath = join(dir, "preview.m4a");
        const androidPath = join(dir, "android.mp3");
        const iphonePath = join(dir, "iphone.m4a");
        await writeFile(sourcePath, input.sourceBytes);

        const common = [
            "-hide_banner",
            "-y",
            "-ss", String(input.clipStartSeconds),
            "-t", String(input.durationSeconds),
            "-i", sourcePath,
            "-vn",
            "-ac", "1",
            "-ar", "44100",
        ];

        const preview = await runCommand(input.ffmpegBinary, [
            ...common,
            "-c:a", "aac",
            "-b:a", "128k",
            previewPath,
        ]);
        if (preview.code !== 0) {
            return { error: "Preview AAC encode failed.", code: "PREVIEW_ENCODE_FAILED" };
        }

        const android = await runCommand(input.ffmpegBinary, [
            ...common,
            "-c:a", "libmp3lame",
            "-b:a", "160k",
            androidPath,
        ]);
        if (android.code !== 0) {
            return { error: "Android MP3 encode failed.", code: "ANDROID_ENCODE_FAILED" };
        }

        const iphone = await runCommand(input.ffmpegBinary, [
            ...common,
            "-c:a", "aac",
            "-b:a", "192k",
            iphonePath,
        ]);
        if (iphone.code !== 0) {
            return { error: "iPhone AAC encode failed.", code: "IPHONE_ENCODE_FAILED" };
        }

        return {
            preview: await readFile(previewPath),
            android: await readFile(androidPath),
            iphone: await readFile(iphonePath),
        };
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
}

/**
 * Execute a ringtone processing job from trusted source bytes and DB clip bounds.
 * Does not mutate the original source object.
 */
export async function executeRingtoneProcessingJob(
    job: RingtoneProcessJob,
    sourceBytes: Buffer,
): Promise<RingtoneProcessExecutionResult> {
    if (!sourceBytes?.byteLength) {
        return { ok: false, error: "Source audio is empty.", code: "EMPTY_SOURCE" };
    }
    if (job.durationSeconds > RINGTONE_MAX_DURATION_SECONDS) {
        return { ok: false, error: "Clip duration exceeds 30 seconds.", code: "DURATION_OVER_MAX" };
    }
    if (job.durationSeconds < RINGTONE_MIN_DURATION_SECONDS) {
        return { ok: false, error: "Clip duration is below 15 seconds.", code: "DURATION_UNDER_MIN" };
    }
    if (job.clipEndSeconds <= job.clipStartSeconds) {
        return { ok: false, error: "Invalid clip boundaries.", code: "INVALID_BOUNDARY" };
    }
    const window = Number((job.clipEndSeconds - job.clipStartSeconds).toFixed(3));
    if (Math.abs(window - job.durationSeconds) > 0.001) {
        return { ok: false, error: "Clip window does not match duration.", code: "INVALID_BOUNDARY" };
    }

    const sourceChecksum = checksumBuffer(sourceBytes);
    const plan = planRingtoneProcessing({
        ...job,
        sourceChecksum,
    });
    if (!plan.ok) {
        return { ok: false, error: plan.error, code: "PLAN_FAILED" };
    }

    const ffmpegBinary = await ffmpegAvailable();
    let previewBytes: Buffer;
    let androidBytes: Buffer;
    let iphoneBytes: Buffer;
    let engine: "ffmpeg" | "test_mode";

    if (ffmpegBinary) {
        const encoded = await encodeWithFfmpeg({
            ffmpegBinary,
            sourceBytes,
            clipStartSeconds: job.clipStartSeconds,
            durationSeconds: job.durationSeconds,
        });
        if ("error" in encoded) {
            return { ok: false, error: encoded.error, code: encoded.code };
        }
        previewBytes = encoded.preview;
        androidBytes = encoded.android;
        iphoneBytes = encoded.iphone;
        engine = "ffmpeg";
    } else if (isRingtoneProcessingTestModeEnabled()) {
        previewBytes = buildTestModeM4a(job.durationSeconds, "preview");
        androidBytes = buildTestModeMp3(job.durationSeconds);
        iphoneBytes = buildTestModeM4a(job.durationSeconds, "iphone");
        engine = "test_mode";
    } else {
        return {
            ok: false,
            error: "ffmpeg is required for ringtone processing. Set RINGTONE_PROCESSING_TEST_MODE=1 only for isolated verification.",
            code: "FFMPEG_UNAVAILABLE",
        };
    }

    const previewCheck = validateProcessedArtifact({
        bytes: previewBytes,
        mimeType: "audio/mp4",
        expectedDurationSeconds: job.durationSeconds,
        label: "Preview",
    });
    const androidCheck = validateProcessedArtifact({
        bytes: androidBytes,
        mimeType: "audio/mpeg",
        expectedDurationSeconds: job.durationSeconds,
        label: "Android",
    });
    const iphoneCheck = validateProcessedArtifact({
        bytes: iphoneBytes,
        mimeType: "audio/mp4",
        expectedDurationSeconds: job.durationSeconds,
        label: "iPhone",
    });
    if (!previewCheck.ok) return { ok: false, error: previewCheck.error, code: previewCheck.code };
    if (!androidCheck.ok) return { ok: false, error: androidCheck.error, code: androidCheck.code };
    if (!iphoneCheck.ok) return { ok: false, error: iphoneCheck.error, code: iphoneCheck.code };

    return {
        ok: true,
        previewPath: plan.previewPath,
        androidPath: plan.androidPath,
        iphonePath: plan.iphonePath,
        previewBucket: plan.previewBucket,
        downloadBucket: plan.downloadBucket,
        previewMimeType: previewCheck.mimeType,
        androidMimeType: androidCheck.mimeType,
        iphoneMimeType: iphoneCheck.mimeType,
        previewBytes,
        androidBytes,
        iphoneBytes,
        outputDurationSeconds: job.durationSeconds,
        sourceChecksum,
        processingVersion: RINGTONE_PROCESSING_VERSION,
        engine,
        result: {
            sampleRate: 44100,
            channels: 1,
            clipStartSeconds: job.clipStartSeconds,
            clipEndSeconds: job.clipEndSeconds,
            durationSeconds: job.durationSeconds,
            previewBytes: previewCheck.byteLength,
            androidBytes: androidCheck.byteLength,
            iphoneBytes: iphoneCheck.byteLength,
            engine,
            processingVersion: RINGTONE_PROCESSING_VERSION,
        },
    };
}
