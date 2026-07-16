"use client";

import {
    RINGTONE_MAX_DURATION_SECONDS,
    RINGTONE_MIN_DURATION_SECONDS,
} from "@/lib/ringtone-constants";
import {
    clampRingtoneDuration,
    formatClipClock,
    maxClipStartSeconds,
} from "@/lib/ringtone-creator-client";

type RingtoneClipTimelineProps = {
    sourceDurationSeconds: number;
    clipStartSeconds: number;
    durationSeconds: number;
    labels: {
        clipStart: string;
        clipEnd: string;
        duration: string;
        sourceDuration: string;
    };
    onChange: (next: { clipStartSeconds: number; durationSeconds: number }) => void;
    disabled?: boolean;
};

export function RingtoneClipTimeline({
    sourceDurationSeconds,
    clipStartSeconds,
    durationSeconds,
    labels,
    onChange,
    disabled = false,
}: RingtoneClipTimelineProps) {
    const source = Math.max(0, Number(sourceDurationSeconds) || 0);
    const durationOptions = Array.from(
        { length: RINGTONE_MAX_DURATION_SECONDS - RINGTONE_MIN_DURATION_SECONDS + 1 },
        (_, index) => RINGTONE_MIN_DURATION_SECONDS + index,
    ).filter((value) => value <= Math.max(RINGTONE_MIN_DURATION_SECONDS, Math.floor(source || RINGTONE_MAX_DURATION_SECONDS)));

    const safeDuration = clampRingtoneDuration(source || RINGTONE_MAX_DURATION_SECONDS, durationSeconds);
    const maxStart = maxClipStartSeconds(source || safeDuration, safeDuration);
    const safeStart = Math.min(Math.max(0, clipStartSeconds), maxStart);
    const clipEnd = Number((safeStart + safeDuration).toFixed(3));
    const startPercent = source > 0 ? (safeStart / source) * 100 : 0;
    const widthPercent = source > 0 ? (safeDuration / source) * 100 : 100;

    return (
        <div className="ringtone-clip-timeline" data-ringtone-clip-timeline="true">
            <div className="ringtone-clip-meta" aria-live="polite">
                <span>{labels.sourceDuration}: {formatClipClock(source)}</span>
                <span>{labels.clipStart}: {formatClipClock(safeStart)}</span>
                <span>{labels.clipEnd}: {formatClipClock(clipEnd)}</span>
                <span>{labels.duration}: {safeDuration}s</span>
            </div>

            <label className="ringtone-field">
                <span>{labels.duration}</span>
                <select
                    value={safeDuration}
                    disabled={disabled || source < RINGTONE_MIN_DURATION_SECONDS}
                    onChange={(event) => {
                        const nextDuration = clampRingtoneDuration(source, Number(event.target.value));
                        const nextMaxStart = maxClipStartSeconds(source, nextDuration);
                        onChange({
                            durationSeconds: nextDuration,
                            clipStartSeconds: Math.min(safeStart, nextMaxStart),
                        });
                    }}
                >
                    {durationOptions.map((value) => (
                        <option key={value} value={value}>{value}s</option>
                    ))}
                </select>
            </label>

            <label className="ringtone-field">
                <span>{labels.clipStart}</span>
                <input
                    type="range"
                    min={0}
                    max={maxStart || 0}
                    step={0.1}
                    value={safeStart}
                    disabled={disabled || maxStart <= 0}
                    aria-valuemin={0}
                    aria-valuemax={maxStart || 0}
                    aria-valuenow={safeStart}
                    aria-label={labels.clipStart}
                    onChange={(event) => {
                        onChange({
                            durationSeconds: safeDuration,
                            clipStartSeconds: Number(event.target.value),
                        });
                    }}
                />
            </label>

            <div
                className="ringtone-timeline-track"
                role="img"
                aria-label={`${labels.clipStart} ${formatClipClock(safeStart)}, ${labels.clipEnd} ${formatClipClock(clipEnd)}`}
            >
                <div
                    className="ringtone-timeline-window"
                    style={{ left: `${startPercent}%`, width: `${Math.max(widthPercent, 2)}%` }}
                />
            </div>
        </div>
    );
}
