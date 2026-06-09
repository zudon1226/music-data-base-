"use client";

import { useEffect, useRef, useState } from "react";

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [darkMode, setDarkMode] = useState(true);

  const [search, setSearch] = useState("");

  const [volume, setVolume] = useState(1);

  const [currentTime, setCurrentTime] = useState(0);

  const [duration, setDuration] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);

  const [queue, setQueue] = useState<any[]>([]);

  const [currentTrack, setCurrentTrack] = useState<any>(null);

  const [tracks, setTracks] = useState([
    {
      id: 1,
      title: "Neon Dreams",
      artist: "Z Music",
      plays: 1200,
      likes: 32,
      image:
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1400&auto=format&fit=crop",
      audio:
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },

    {
      id: 2,
      title: "Future Waves",
      artist: "Cyber Audio",
      plays: 890,
      likes: 20,
      image:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1400&auto=format&fit=crop",
      audio:
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    },
  ]);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = volume;
  }, [volume]);

  const playTrack = (track: any) => {
    if (!audioRef.current) return;

    audioRef.current.src = track.audio;

    audioRef.current.play();

    setCurrentTrack(track);

    setIsPlaying(true);

    setTracks((prev) =>
      prev.map((t) =>
        t.id === track.id
          ? {
              ...t,
              plays: t.plays + 1,
            }
          : t
      )
    );
  };

  const pauseTrack = () => {
    if (!audioRef.current) return;

    audioRef.current.pause();

    setIsPlaying(false);
  };

  const likeTrack = (id: number) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === id
          ? {
              ...track,
              likes: track.likes + 1,
            }
          : track
      )
    );
  };

  const deleteTrack = (id: number) => {
    setTracks((prev) => prev.filter((track) => track.id !== id));
  };

  const addToQueue = (track: any) => {
    setQueue((prev) => [...prev, track]);
  };

  const filteredTracks = tracks.filter(
    (track) =>
      track.title.toLowerCase().includes(search.toLowerCase()) ||
      track.artist.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: darkMode
          ? "linear-gradient(to bottom,#001133,#000814)"
          : "#f4f7ff",
        color: darkMode ? "white" : "black",
        display: "flex",
        fontFamily: "Arial",
      }}
    >
      {/* SIDEBAR */}
      <div
        style={{
          width: 220,
          background: darkMode ? "#001060" : "#dde7ff",
          padding: 20,
          borderRight: "2px solid #00d9ff",
        }}
      >
        <h1
          style={{
            fontSize: 70,
            lineHeight: 0.9,
            marginBottom: 40,
          }}
        >
          Z Music
          <br />
          V22
        </h1>

        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{
            width: "100%",
            padding: 16,
            borderRadius: 16,
            border: "none",
            background: "#9df5f0",
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: 20,
          }}
        >
          Toggle Theme
        </button>

        <button
          style={{
            width: "100%",
            padding: 16,
            borderRadius: 16,
            border: "none",
            background: "#7CFC4E",
            color: "black",
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: 20,
          }}
        >
          Start Recording
        </button>

        <div
          style={{
            border: "2px solid #00ff88",
            borderRadius: 20,
            padding: 20,
            marginBottom: 30,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#7CFC4E",
              boxShadow: "0 0 20px #7CFC4E",
              marginBottom: 10,
            }}
          />

          <div style={{ fontSize: 30 }}>READY</div>

          <div style={{ marginTop: 10 }}>
            🎵 {tracks.length} Tracks
          </div>

          <div>
            🔥{" "}
            {tracks.reduce(
              (sum, track) => sum + track.plays,
              0
            )}{" "}
            Plays
          </div>
        </div>

        {/* QUEUE */}
        <div>
          <h2>Queue</h2>

          {queue.map((track, index) => (
            <div
              key={index}
              style={{
                padding: 10,
                background: "#001a66",
                borderRadius: 10,
                marginBottom: 10,
                fontSize: 14,
              }}
            >
              🎧 {track.title}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div
        style={{
          flex: 1,
          padding: 30,
        }}
      >
        {/* SEARCH */}
        <input
          placeholder="Search music..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          style={{
            width: "100%",
            padding: 24,
            borderRadius: 24,
            border: "2px solid #00d9ff",
            background: "#020b7a",
            color: "white",
            fontSize: 28,
            marginBottom: 30,
          }}
        />

        {/* HERO */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 20,
            marginBottom: 30,
          }}
        >
          <div
            style={{
              background: "#001a66",
              border: "2px solid #00d9ff",
              borderRadius: 30,
              padding: 30,
            }}
          >
            <div
              style={{
                color: "#7CFC4E",
                fontWeight: "bold",
                marginBottom: 20,
              }}
            >
              ZMUSIC NEXT GEN PLATFORM
            </div>

            <div
              style={{
                fontSize: 90,
                lineHeight: 0.9,
                fontWeight: "bold",
              }}
            >
              Upload.
              <br />
              Stream.
              <br />
              Create.
            </div>

            <div
              style={{
                marginTop: 20,
                color: "#9cbcff",
                fontSize: 22,
              }}
            >
              Futuristic streaming platform for creators.
            </div>
          </div>

          <div
            style={{
              background: "#00003d",
              border: "2px solid #00d9ff",
              borderRadius: 30,
              padding: 30,
            }}
          >
            <h1 style={{ fontSize: 50 }}>
              Trending
            </h1>
          </div>
        </div>

        {/* TRACKS */}
        <div
          style={{
            display: "grid",
            gap: 30,
          }}
        >
          {filteredTracks.map((track) => (
            <div
              key={track.id}
              style={{
                background: "#00145a",
                border: "2px solid #00d9ff",
                borderRadius: 30,
                overflow: "hidden",
              }}
            >
              <img
                src={track.image}
                alt={track.title}
                style={{
                  width: "100%",
                  height: 320,
                  objectFit: "cover",
                }}
              />

              <div style={{ padding: 24 }}>
                <h1
                  style={{
                    fontSize: 54,
                    marginBottom: 10,
                  }}
                >
                  {track.title}
                </h1>

                <div
                  style={{
                    fontSize: 26,
                    color: "#8fb8ff",
                    marginBottom: 14,
                  }}
                >
                  {track.artist}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 20,
                    marginBottom: 20,
                    color: "#b7d4ff",
                    fontSize: 18,
                  }}
                >
                  <div>🔥 {track.plays}</div>

                  <div>❤️ {track.likes}</div>
                </div>

                {/* BUTTONS */}
                <div
                  style={{
                    display: "flex",
                    gap: 14,
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
                      padding: "16px 24px",
                      borderRadius: 16,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    ▶ Play
                  </button>

                  <button
                    onClick={pauseTrack}
                    style={{
                      background: "#7CFC4E",
                      color: "black",
                      border: "none",
                      padding: "16px 24px",
                      borderRadius: 16,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    ⏸ Pause
                  </button>

                  <button
                    onClick={() =>
                      likeTrack(track.id)
                    }
                    style={{
                      background: "#ff3b8d",
                      color: "white",
                      border: "none",
                      padding: "16px 24px",
                      borderRadius: 16,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    ❤️ Like
                  </button>

                  <button
                    onClick={() =>
                      addToQueue(track)
                    }
                    style={{
                      background: "#ffaa00",
                      color: "black",
                      border: "none",
                      padding: "16px 24px",
                      borderRadius: 16,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    ➕ Queue
                  </button>

                  <button
                    onClick={() =>
                      deleteTrack(track.id)
                    }
                    style={{
                      background: "#ff4d6d",
                      color: "white",
                      border: "none",
                      padding: "16px 24px",
                      borderRadius: 16,
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AUDIO */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(
              audioRef.current.currentTime
            );

            setDuration(
              audioRef.current.duration
            );
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
        }}
      />

      {/* PLAYER BAR */}
      {currentTrack && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 220,
            right: 0,
            background: "#000",
            borderTop: "2px solid #00d9ff",
            padding: 20,
            zIndex: 999,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent:
                "space-between",
              marginBottom: 10,
            }}
          >
            <div>
              🎧 {currentTrack.title}
            </div>

            <div>
              {Math.floor(currentTime)}s /
              {Math.floor(duration)}s
            </div>
          </div>

          {/* PROGRESS */}
          <div
            style={{
              width: "100%",
              height: 10,
              background: "#222",
              borderRadius: 20,
              overflow: "hidden",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                width: `${
                  duration
                    ? (currentTime /
                        duration) *
                      100
                    : 0
                }%`,
                height: "100%",
                background:
                  "linear-gradient(to right,#00d9ff,#7CFC4E)",
              }}
            />
          </div>

          {/* VOLUME */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            🔊

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
              style={{
                width: 200,
              }}
            />

            <div>
              {Math.floor(volume * 100)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
