"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaPlay,
  FaPause,
  FaTrash,
  FaHeart,
  FaPlus,
  FaStepBackward,
  FaStepForward,
  FaRandom,
  FaRedo,
  FaVolumeUp,
  FaUpload,
  FaVideo,
} from "react-icons/fa";

type Track = {
  id: number;
  title: string;
  artist: string;
  cover: string;
  audio?: string;
  video?: string;
  plays: number;
  likes: number;
  bpm: number;
  genre: string;
  duration: string;
};

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [tracks, setTracks] = useState<Track[]>([
    {
      id: 1,
      title: "Neon Dreams",
      artist: "Z Music",
      cover:
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1600&auto=format&fit=crop",
      audio:
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      plays: 1201,
      likes: 32,
      bpm: 128,
      genre: "Electronic",
      duration: "3:45",
    },
    {
      id: 2,
      title: "Future Waves",
      artist: "Cyber Audio",
      cover:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1600&auto=format&fit=crop",
      audio:
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      plays: 890,
      likes: 20,
      bpm: 118,
      genre: "Synthwave",
      duration: "4:12",
    },
  ]);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);

  const [progress, setProgress] = useState(0);

  const [currentTime, setCurrentTime] = useState("0:00");

  const [duration, setDuration] = useState("0:00");

  const [volume, setVolume] = useState(0.7);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    const updateProgress = () => {
      if (!audio.duration) return;

      const percent =
        (audio.currentTime / audio.duration) * 100;

      setProgress(percent);

      setCurrentTime(formatTime(audio.currentTime));

      setDuration(formatTime(audio.duration));
    };

    const onEnded = () => {
      nextTrack();
    };

    audio.addEventListener("timeupdate", updateProgress);

    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener(
        "timeupdate",
        updateProgress
      );

      audio.removeEventListener("ended", onEnded);
    };
  }, [currentTrack]);

  const playTrack = async (track: Track, index: number) => {
    if (!audioRef.current) return;

    try {
      if (track.audio) {
        audioRef.current.src = track.audio;

        audioRef.current.load();

        await audioRef.current.play();

        setCurrentTrack(track);

        setCurrentIndex(index);

        setIsPlaying(true);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const pauseTrack = () => {
    if (!audioRef.current) return;

    audioRef.current.pause();

    setIsPlaying(false);
  };

  const resumeTrack = async () => {
    if (!audioRef.current) return;

    try {
      await audioRef.current.play();

      setIsPlaying(true);
    } catch (error) {
      console.log(error);
    }
  };

  const nextTrack = () => {
    const next =
      currentIndex + 1 >= tracks.length
        ? 0
        : currentIndex + 1;

    playTrack(tracks[next], next);
  };

  const previousTrack = () => {
    const prev =
      currentIndex - 1 < 0
        ? tracks.length - 1
        : currentIndex - 1;

    playTrack(tracks[prev], prev);
  };

  const handleSeek = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!audioRef.current) return;

    const seekTime =
      (Number(e.target.value) / 100) *
      audioRef.current.duration;

    audioRef.current.currentTime = seekTime;

    setProgress(Number(e.target.value));
  };

  const handleUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;

    if (!files) return;

    const uploadedTracks: Track[] = [];

    Array.from(files).forEach((file, index) => {
      const fileURL = URL.createObjectURL(file);

      uploadedTracks.push({
        id: Date.now() + index,

        title: file.name,

        artist: "Uploaded Media",

        cover:
          "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1600&auto=format&fit=crop",

        audio: file.type.includes("audio")
          ? fileURL
          : undefined,

        video: file.type.includes("video")
          ? fileURL
          : undefined,

        plays: 0,

        likes: 0,

        bpm: 120,

        genre: "Uploaded",

        duration: "0:00",
      });
    });

    setTracks((prev) => [...uploadedTracks, ...prev]);
  };

  return (
    <main
      style={{
        background: "#001b8f",
        minHeight: "100vh",
        color: "white",
        padding: 20,
        fontFamily: "Arial",
      }}
    >
      <audio ref={audioRef} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 30,
        }}
      >
        <h1
          style={{
            fontSize: 70,
            fontWeight: "bold",
          }}
        >
          Z Music V31
        </h1>

        <label
          style={{
            background: "#7CFC4E",
            color: "black",
            padding: "18px 28px",
            borderRadius: 18,
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 0 15px #7CFC4E",
          }}
        >
          <FaUpload /> Upload Media

          <input
            type="file"
            hidden
            multiple
            accept="audio/*,video/*"
            onChange={handleUpload}
          />
        </label>
      </div>

      {tracks.map((track, index) => (
        <div
          key={track.id}
          style={{
            background: "#0020a0",
            borderRadius: 25,
            overflow: "hidden",
            marginBottom: 35,
            border:
              currentTrack?.id === track.id
                ? "3px solid #00e5ff"
                : "2px solid #00d9ff",

            boxShadow:
              currentTrack?.id === track.id
                ? "0 0 30px #00e5ff"
                : "0 0 15px #00d9ff",
          }}
        >
          <img
            src={track.cover}
            style={{
              width: "100%",
              height: 320,
              objectFit: "cover",
            }}
          />

          <div style={{ padding: 30 }}>
            <h2
              style={{
                fontSize: 60,
                marginBottom: 20,
              }}
            >
              {track.title}
            </h2>

            <p
              style={{
                fontSize: 28,
                opacity: 0.8,
              }}
            >
              {track.artist}
            </p>

            <div
              style={{
                display: "flex",
                gap: 20,
                flexWrap: "wrap",
                marginTop: 20,
                marginBottom: 30,
                fontSize: 24,
              }}
            >
              <span>🔥 {track.plays}</span>
              <span>❤️ {track.likes}</span>
              <span>🎵 {track.duration}</span>
              <span>{track.genre}</span>
              <span>⚡ {track.bpm} BPM</span>
            </div>

            <div
              style={{
                display: "flex",
                gap: 15,
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() =>
                  playTrack(track, index)
                }
                style={buttonStyle("#00d9ff")}
              >
                <FaPlay /> Play
              </button>

              <button
                onClick={pauseTrack}
                style={buttonStyle("#7CFC4E")}
              >
                <FaPause /> Pause
              </button>

              <button
                style={buttonStyle("#ff2e97")}
              >
                <FaHeart /> Like
              </button>

              <button
                style={buttonStyle("#ffbe0b")}
              >
                <FaPlus /> Queue
              </button>

              <button
                style={buttonStyle("#9d00ff")}
              >
                <FaVideo /> Details
              </button>

              <button
                style={buttonStyle("#ff5c8a")}
              >
                <FaTrash /> Delete
              </button>
            </div>

            {track.video && (
              <video
                src={track.video}
                controls
                style={{
                  width: "100%",
                  borderRadius: 20,
                  marginTop: 30,
                }}
              />
            )}
          </div>
        </div>
      ))}

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "black",
          padding: 25,
          borderTop: "2px solid #00d9ff",
          boxShadow: "0 0 20px #00d9ff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <h2
            style={{
              fontSize: 36,
            }}
          >
            {currentTrack?.title ||
              "No Track Playing"}
          </h2>

          <h2
            style={{
              fontSize: 28,
            }}
          >
            {currentTime} / {duration}
          </h2>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleSeek}
          style={{
            width: "100%",
            marginBottom: 25,
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 15,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={previousTrack}
            style={buttonStyle("#00d9ff")}
          >
            <FaStepBackward />
          </button>

          <button
            onClick={() =>
              isPlaying
                ? pauseTrack()
                : resumeTrack()
            }
            style={buttonStyle("#7CFC4E")}
          >
            {isPlaying ? (
              <FaPause />
            ) : (
              <FaPlay />
            )}
          </button>

          <button
            onClick={nextTrack}
            style={buttonStyle("#00d9ff")}
          >
            <FaStepForward />
          </button>

          <button
            style={buttonStyle("#666")}
          >
            <FaRandom />
          </button>

          <button
            style={buttonStyle("#666")}
          >
            <FaRedo />
          </button>

          <FaVolumeUp size={28} />

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) =>
              setVolume(
                Number(e.target.value)
              )
            }
          />
        </div>
      </div>
    </main>
  );
}

function formatTime(time: number) {
  if (!time) return "0:00";

  const minutes = Math.floor(time / 60);

  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function buttonStyle(color: string) {
  return {
    background: color,
    color: "black",
    border: "none",
    padding: "16px 28px",
    borderRadius: 15,
    fontWeight: "bold",
    fontSize: 22,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 10,
    boxShadow: `0 0 15px ${color}`,
  };
}
