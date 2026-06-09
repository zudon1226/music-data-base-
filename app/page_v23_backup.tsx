"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tracksData = [
    {
      id: 1,
      title: "Neon Dreams",
      artist: "Z Music",
      image:
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1600&auto=format&fit=crop",
      audio:
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      plays: 1200,
      likes: 32,
      duration: "3:45",
    },
    {
      id: 2,
      title: "Future Waves",
      artist: "Cyber Audio",
      image:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1600&auto=format&fit=crop",
      audio:
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      plays: 890,
      likes: 20,
      duration: "4:12",
    },
  ];

  const [tracks, setTracks] = useState(tracksData);
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const playTrack = (track: any) => {
    if (!audioRef.current) return;

    if (currentTrack?.id !== track.id) {
      audioRef.current.src = track.audio;
      audioRef.current.play();

      setCurrentTrack(track);
      setIsPlaying(true);

      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id
            ? { ...t, plays: t.plays + 1 }
            : t
        )
      );
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const pauseTrack = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const nextTrack = () => {
    if (!currentTrack) return;

    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );

    const next =
      tracks[(currentIndex + 1) % tracks.length];

    playTrack(next);
  };

  const prevTrack = () => {
    if (!currentTrack) return;

    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );

    const prev =
      tracks[
        (currentIndex - 1 + tracks.length) %
          tracks.length
      ];

    playTrack(prev);
  };

  const addLike = (id: number) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === id
          ? { ...track, likes: track.likes + 1 }
          : track
      )
    );
  };

  const addToQueue = (track: any) => {
    setQueue((prev) => [...prev, track]);
  };

  const removeTrack = (id: number) => {
    setTracks((prev) =>
      prev.filter((track) => track.id !== id)
    );
  };

  const formatTime = (time: number) => {
    if (!time) return "0:00";

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration || 0);
    };

    audio.addEventListener(
      "timeupdate",
      updateTime
    );

    return () => {
      audio.removeEventListener(
        "timeupdate",
        updateTime
      );
    };
  }, []);

  const filteredTracks = tracks.filter((track) =>
    `${track.title} ${track.artist}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div
      style={{
        background: "#00154d",
        minHeight: "100vh",
        color: "white",
        display: "flex",
        fontFamily: "Arial",
      }}
    >
      <audio ref={audioRef} />

      {/* SIDEBAR */}
      <div
        style={{
          width: 220,
          padding: 20,
          borderRight: "2px solid #00d9ff",
        }}
      >
        <h1
          style={{
            fontSize: 60,
            lineHeight: 1,
          }}
        >
          Z Music V23
        </h1>

        <button
          style={{
            width: "100%",
            marginTop: 30,
            padding: 16,
            borderRadius: 20,
            border: "none",
            background: "#8ef7f6",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Toggle Theme
        </button>

        <button
          style={{
            width: "100%",
            marginTop: 20,
            padding: 16,
            borderRadius: 20,
            border: "2px solid #4cff00",
            background: "#89ff3d",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Start Recording
        </button>

        <div
          style={{
            marginTop: 20,
            padding: 20,
            borderRadius: 20,
            border: "2px solid #00ff95",
            background: "#00174f",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#97ff3d",
              boxShadow:
                "0 0 20px #97ff3d",
            }}
          />

          <h2>READY</h2>

          <p>🎵 {tracks.length} Tracks</p>
          <p>
            🔥{" "}
            {tracks.reduce(
              (a, b) => a + b.plays,
              0
            )}{" "}
            Plays
          </p>
        </div>

        <h2 style={{ marginTop: 40 }}>
          Queue
        </h2>

        {queue.map((track, index) => (
          <div
            key={index}
            style={{
              marginTop: 10,
              padding: 10,
              background: "#002a80",
              borderRadius: 10,
            }}
          >
            {track.title}
          </div>
        ))}
      </div>

      {/* MAIN */}
      <div
        style={{
          flex: 1,
          padding: 25,
          paddingBottom: 120,
        }}
      >
        <input
          placeholder="Search music..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          style={{
            width: "100%",
            padding: 24,
            borderRadius: 20,
            border: "2px solid #00d9ff",
            background: "#00106a",
            color: "white",
            fontSize: 30,
            marginBottom: 30,
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "2fr 1fr",
            gap: 25,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              border:
                "2px solid #00d9ff",
              borderRadius: 30,
              padding: 30,
              background: "#001b66",
            }}
          >
            <h3
              style={{
                color: "#7dff32",
              }}
            >
              ZMUSIC NEXT GEN PLATFORM
            </h3>

            <h1
              style={{
                fontSize: 90,
                lineHeight: 1,
              }}
            >
              Upload.
              <br />
              Stream.
              <br />
              Create.
            </h1>

            <p
              style={{
                color: "#9fb3ff",
                fontSize: 20,
              }}
            >
              Futuristic streaming platform
              for creators.
            </p>
          </div>

          <div
            style={{
              border:
                "2px solid #00d9ff",
              borderRadius: 30,
              padding: 30,
              background: "#00004d",
            }}
          >
            <h1>Trending</h1>
          </div>
        </div>

        {/* TRACKS */}
        {filteredTracks.map((track) => (
          <div
            key={track.id}
            style={{
              background: "#001b6b",
              border:
                "2px solid #00d9ff",
              borderRadius: 30,
              overflow: "hidden",
              marginBottom: 35,
            }}
          >
            <img
              src={track.image}
              style={{
                width: "100%",
                height: 300,
                objectFit: "cover",
              }}
            />

            <div style={{ padding: 30 }}>
              <h1
                style={{
                  fontSize: 60,
                  margin: 0,
                }}
              >
                {track.title}
              </h1>

              <p
                style={{
                  color: "#aab8ff",
                  fontSize: 30,
                }}
              >
                {track.artist}
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 25,
                  marginBottom: 25,
                  color: "#b8c5ff",
                  fontSize: 28,
                }}
              >
                <span>
                  🔥 {track.plays}
                </span>

                <span>
                  ❤️ {track.likes}
                </span>

                <span>
                  🎵 {track.duration}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 20,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() =>
                    playTrack(track)
                  }
                  style={{
                    background: "#00d9ff",
                    color: "black",
                    border: "none",
                    padding:
                      "18px 30px",
                    borderRadius: 18,
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: 20,
                  }}
                >
                  ▶ Play
                </button>

                <button
                  onClick={pauseTrack}
                  style={{
                    background: "#89ff3d",
                    color: "black",
                    border: "none",
                    padding:
                      "18px 30px",
                    borderRadius: 18,
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: 20,
                  }}
                >
                  ⏸ Pause
                </button>

                <button
                  onClick={() =>
                    addLike(track.id)
                  }
                  style={{
                    background: "#ff3d8e",
                    color: "white",
                    border: "none",
                    padding:
                      "18px 30px",
                    borderRadius: 18,
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: 20,
                  }}
                >
                  ❤️ Like
                </button>

                <button
                  onClick={() =>
                    addToQueue(track)
                  }
                  style={{
                    background: "#ffb300",
                    color: "black",
                    border: "none",
                    padding:
                      "18px 30px",
                    borderRadius: 18,
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: 20,
                  }}
                >
                  ➕ Queue
                </button>

                <button
                  onClick={() =>
                    removeTrack(track.id)
                  }
                  style={{
                    background: "#ff4d7a",
                    color: "white",
                    border: "none",
                    padding:
                      "18px 30px",
                    borderRadius: 18,
                    fontWeight: "bold",
                    cursor: "pointer",
                    fontSize: 20,
                  }}
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FLOATING PLAYER */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 220,
          right: 0,
          background:
            "rgba(0,0,0,0.92)",
          backdropFilter: "blur(12px)",
          borderTop:
            "2px solid #00d9ff",
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>
              {currentTrack
                ? currentTrack.title
                : "No Track Playing"}
            </h3>

            <p
              style={{
                margin: 0,
                color: "#9fb3ff",
              }}
            >
              {currentTrack?.artist}
            </p>
          </div>

          <div>
            {formatTime(currentTime)} /{" "}
            {formatTime(duration)}
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(e) => {
            if (audioRef.current) {
              audioRef.current.currentTime =
                Number(e.target.value);
            }
          }}
          style={{
            width: "100%",
            marginBottom: 20,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <button
            onClick={prevTrack}
            style={{
              padding: 14,
              borderRadius: 12,
              border: "none",
              background: "#00d9ff",
              fontWeight: "bold",
            }}
          >
            ⏮
          </button>

          <button
            onClick={() => {
              if (isPlaying) {
                pauseTrack();
              } else if (currentTrack) {
                playTrack(currentTrack);
              }
            }}
            style={{
              padding:
                "14px 30px",
              borderRadius: 12,
              border: "none",
              background: "#89ff3d",
              fontWeight: "bold",
            }}
          >
            {isPlaying
              ? "⏸ Pause"
              : "▶ Play"}
          </button>

          <button
            onClick={nextTrack}
            style={{
              padding: 14,
              borderRadius: 12,
              border: "none",
              background: "#00d9ff",
              fontWeight: "bold",
            }}
          >
            ⏭
          </button>

          <div
            style={{
              marginLeft: 30,
            }}
          >
            🔊
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => {
              const newVolume = Number(
                e.target.value
              );

              setVolume(newVolume);

              if (audioRef.current) {
                audioRef.current.volume =
                  newVolume;
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
