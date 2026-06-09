"use client";

/* eslint-disable @next/next/no-img-element */

import { type ChangeEvent, useEffect, useRef, useState } from "react";

type Song = {
  artist: string;
  song?: string;
  title?: string;
  cover: string;
  audio: string;
};

type Props = {
  currentSong: Song | null;
  onNext: () => void;
};

export default function AdvancedPlayer({
  currentSong,
  onNext,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!audioRef.current) return;

    if (playing) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  }, [playing]);

  const updateProgress = () => {
    if (!audioRef.current) return;

    const current = audioRef.current.currentTime;
    const total = audioRef.current.duration;

    setProgress(current);
    setDuration(total);
  };

  const seekAudio = (event: ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;

    const nextTime = Number(event.target.value);
    audioRef.current.currentTime = nextTime;
    setProgress(nextTime);
  };

  const formatTime = (time: number) => {
    if (!time) return "0:00";

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  if (!currentSong) return null;

  return (
    <div className="advanced-player">
      <audio
        ref={audioRef}
          src={currentSong.audio}
        onTimeUpdate={updateProgress}
        onEnded={onNext}
      />

      <div className="player-left">
        <img
          src={currentSong.cover}
          alt={currentSong.song || currentSong.title || currentSong.artist}
          className="player-cover"
        />

        <div>
          <h3>{currentSong.artist}</h3>
          <p>{currentSong.song || currentSong.title}</p>
        </div>
      </div>

      <div className="player-center">
        <button onClick={() => setPlaying(!playing)}>
          {playing ? "Pause" : "Play"}
        </button>

        <button onClick={onNext}>Next</button>

        <div className="progress-wrapper">
          <span>{formatTime(progress)}</span>

          <input
            name="advancedPlaybackProgress"
            type="range"
            min="0"
            max={duration || 0}
            value={progress}
            onChange={seekAudio}
            className="progress-bar"
          />

          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
