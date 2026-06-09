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
  FaMusic,
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
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a",
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
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f",
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
  const [volume, setVolume] = useState(0.7);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = volume;

    const updateProgress = () => {
      if (!audioRef.current) return;

      const percent =
        (audioRef.current.currentTime / audioRef.current.duration) * 100;

      setProgress(percent || 0);
    };

    audioRef.current.addEventListener("timeupdate", updateProgress);

    return () => {
      audioRef.current?.removeEventListener(
        "timeupdate",
        updateProgress
      );
    };
  }, [volume]);

  const playTrack = (track: Track) => {
    if (!audioRef.current) return;

    if (currentTrack?.id !== track.id) {
      audioRef.current.src = track.audio || "";
    }

    audioRef.current.play();

    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const pauseTrack = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const handleUpload = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;

    if (!files) return;

    const uploadedTracks: Track[] = [];

    Array.from(files).forEach((file, index) => {
      const fileURL = URL.createObjectURL(file);

      uploadedTracks.push({
        id: Date.now() + index,
        title: file.name,
        artist: "Uploaded Artist",
        cover:
          "https://images.unsplash.com/photo-1511379938547-c1f69419868d",
        audio: file.type.includes("audio") ? fileURL : undefined,
        video: file.type.includes("video") ? fileURL : undefined,
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
        background: "#001c88",
        minHeight: "100vh",
        color: "white",
        padding: 20,
      }}
    >
      <audio ref={audioRef} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <h1 style={{ fontSize: 70 }}>Z Music V30</h1>

        <label
          style={{
            background: "#7CFC4E",
            color: "black",
            padding: 15,
            borderRadius: 15,
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          <FaUpload /> Upload Media
          <input
            type="file"
            multiple
            accept="audio/*,video/*"
            hidden
            onChange={handleUpload}
          />
        </label>
      </div>

      {tracks.map((track) => (
        <div
          key={track.id}
          style={{
            background: "#0020a0",
            borderRadius: 25,
            overflow: "hidden",
            marginBottom: 40,
            border: "2px solid #00d9ff",
            boxShadow: "0 0 20px #00d9ff",
          }}
        >
          <img
            src={track.cover}
            style={{
              width: "100%",
              height: 300,
              objectFit: "cover",
            }}
          />

          <div style={{ padding: 30 }}>
            <h2 style={{ fontSize: 60 }}>{track.title}</h2>

            <p style={{ fontSize: 30 }}>{track.artist}</p>

            <div
              style={{
                display: "flex",
                gap: 20,
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

            <div style={{ display: "flex", gap: 15 }}>
              <button
                onClick={() => playTrack(track)}
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

              <button style={buttonStyle("#ff2e97")}>
                <FaHeart /> Like
              </button>

              <button style={buttonStyle("#ffbe0b")}>
                <FaPlus /> Queue
              </button>

              <button style={buttonStyle("#9d00ff")}>
                <FaVideo /> Details
              </button>

              <button style={buttonStyle("#ff5c8a")}>
                <FaTrash /> Delete
              </button>
            </div>

            {track.video && (
              <video
                src={track.video}
                controls
                style={{
                  width: "100%",
                  marginTop: 25,
                  borderRadius: 20,
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
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            background: "#00d9ff",
            height: 8,
            borderRadius: 999,
            marginBottom: 20,
          }}
        />

        <h2>{currentTrack?.title || "No Track Playing"}</h2>

        <div
          style={{
            display: "flex",
            gap: 15,
            alignItems: "center",
            marginTop: 20,
          }}
        >
          <button style={buttonStyle("#00d9ff")}>
            <FaStepBackward />
          </button>

          <button
            onClick={() =>
              isPlaying
                ? pauseTrack()
                : currentTrack && playTrack(currentTrack)
            }
            style={buttonStyle("#7CFC4E")}
          >
            {isPlaying ? <FaPause /> : <FaPlay />}
          </button>

          <button style={buttonStyle("#00d9ff")}>
            <FaStepForward />
          </button>

          <button style={buttonStyle("#666")}>
            <FaRandom />
          </button>

          <button style={buttonStyle("#666")}>
            <FaRedo />
          </button>

          <FaVolumeUp />

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) =>
              setVolume(Number(e.target.value))
            }
          />
        </div>
      </div>
    </main>
  );
}

function buttonStyle(color: string) {
  return {
    background: color,
    color: "black",
    border: "none",
    padding: "16px 26px",
    borderRadius: 15,
    fontWeight: "bold",
    fontSize: 20,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 10,
    boxShadow: `0 0 15px ${color}`,
  };
}
