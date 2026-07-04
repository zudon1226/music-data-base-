/** DESKTOP ONLY — fast codec sniff (small sample, yields for UI progress). */

const VIDEO_CODEC_TAGS = ["avc1", "avc2", "avc3", "hvc1", "hev1", "av01", "vp09", "mp4v"];
const AUDIO_CODEC_TAGS = ["mp4a", "ac-3", "ec-3", "Opus", "fLaC"];
const CODEC_SAMPLE_BYTES = 256 * 1024;

export type DesktopVideoCodecInfo = {
    videoCodec: string;
    audioCodec: string;
    codecTags: string[];
    mobileCompatible: boolean | null;
};

function findAsciiTagsInBytes(bytes: Uint8Array, tags: string[]) {
    const haystack = new TextDecoder("latin1").decode(bytes);
    return tags.filter((tag) => haystack.includes(tag));
}

function isMobileCompatibleCodec(videoCodec: string, audioCodec: string) {
    const normalizedVideo = videoCodec.toLowerCase();
    const normalizedAudio = audioCodec.toLowerCase();
    const videoOk = !normalizedVideo || normalizedVideo.startsWith("avc");
    const audioOk = !normalizedAudio || normalizedAudio.startsWith("mp4a");
    return videoOk && audioOk;
}

function yieldToBrowser() {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });
}

export async function inspectDesktopVideoFileCodecInfo(
    file: File,
    onReadProgress?: (loaded: number, total: number) => void,
): Promise<DesktopVideoCodecInfo> {
    const sampleSize = Math.min(CODEC_SAMPLE_BYTES, file.size);
    const videoTags = new Set<string>();
    const audioTags = new Set<string>();

    onReadProgress?.(0, file.size);
    await yieldToBrowser();

    const head = new Uint8Array(await file.slice(0, sampleSize).arrayBuffer());
    findAsciiTagsInBytes(head, VIDEO_CODEC_TAGS).forEach((tag) => videoTags.add(tag));
    findAsciiTagsInBytes(head, AUDIO_CODEC_TAGS).forEach((tag) => audioTags.add(tag));
    onReadProgress?.(head.byteLength, file.size);
    await yieldToBrowser();

    if (file.size > sampleSize) {
        const tail = new Uint8Array(await file.slice(Math.max(0, file.size - sampleSize), file.size).arrayBuffer());
        findAsciiTagsInBytes(tail, VIDEO_CODEC_TAGS).forEach((tag) => videoTags.add(tag));
        findAsciiTagsInBytes(tail, AUDIO_CODEC_TAGS).forEach((tag) => audioTags.add(tag));
        onReadProgress?.(head.byteLength + tail.byteLength, file.size);
        await yieldToBrowser();
    }

    const videoCodec = ["avc1", "avc2", "avc3", "hvc1", "hev1", "av01", "vp09", "mp4v"].find((tag) => videoTags.has(tag)) || "";
    const audioCodec = ["mp4a", "ac-3", "ec-3", "Opus", "fLaC"].find((tag) => audioTags.has(tag)) || "";

    return {
        videoCodec,
        audioCodec,
        codecTags: [...videoTags, ...audioTags],
        mobileCompatible: videoCodec || audioCodec ? isMobileCompatibleCodec(videoCodec, audioCodec) : null,
    };
}
