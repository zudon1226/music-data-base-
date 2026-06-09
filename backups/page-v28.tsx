"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Track = {
  id: number;
  title: string;
  artist: string;
  image: string;
  plays: number;
  likes: number;
  duration: string;
  genre: string;
  bpm: number;
};

export default function Home() {
  const [theme, setTheme] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(70);
  const [queue, setQueue] = useState<Track[]>([]);
  const [likedTracks, setLikedTracks] = useState<number[]>([]);
  const [recentTracks, setRecentTracks] = useState<string[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [fxEnabled, setFxEnabled] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const themes = [
    {
      bg: "#001155",
      card: "#001d7a",
      glow: "#00d9ff",
      accent: "#7CFC4E",
    },
    {
      bg: "#240046",
      card: "#3c096c",
      glow: "#ff00ff",
      accent: "#ff9e00",
    },
    {
      bg: "#001b0f",
      card: "#00351f",
      glow: "#00ff99",
      accent: "#adff2f",
    },
    {
      bg: "#160029",
      card: "#240046",
      glow: "#c77dff",
      accent: "#ff4d6d",
    },
  ];

  const activeTheme = themes[theme];

  const tracks: Track[] = useMemo(
    () => [
      {
        id: 1,
        title: "Neon Dreams",
        artist: "Z Music",
        image:
          "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1600&auto=format&fit=crop",
        plays: 1201,
        likes: 32,
        duration: "3:45",
        genre: "Electronic",
        bpm: 128,
      },
      {
        id: 2,
        title: "Future Waves",
        artist: "Cyber Audio",
        image:
          "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1600&auto=format&fit=crop",
        plays: 890,
        likes: 20,
        duration: "4:12",
        genre: "Synthwave",
        bpm: 118,
      },
    ],
    []
  );

  const trendingTracks = tracks.slice(0, 5);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            if (repeat) return 0;
            setIsPlaying(false);
            return 100;
          }
          return prev + 0.4;
        });
      }, 100);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, repeat]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }

      if (e.code === "ArrowUp") {
        setVolume((prev) => Math.min(prev + 5, 100));
      }

      if (e.code === "ArrowDown") {
        setVolume((prev) => Math.max(prev - 5, 0));
      }

      if (e.code === "ArrowRight") {
        setProgress((prev) => Math.min(prev + 5, 100));
      }

      if (e.code === "ArrowLeft") {
        setProgress((prev) => Math.max(prev - 5, 0));
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  const playTrack = (track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);

    if (!recentTracks.includes(track.title)) {
      setRecentTracks((prev) => [track.title, ...prev.slice(0, 4)]);
    }
  };

  const pauseTrack = () => {
    setIsPlaying(false);
  };

  const likeTrack = (id: number) => {
    if (likedTracks.includes(id)) return;
    setLikedTracks((prev) => [...prev, id]);
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => [...prev, track]);
  };

  return (
    <main
      style={{
        background: activeTheme.bg,
        minHeight: "100vh",
        color: "white",
        display: "flex",
        fontFamily: "Arial",
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: "240px",
          background: "#00104a",
          borderRight: `2px solid ${activeTheme.glow}`,
          padding: "20px",
          boxShadow: `0 0 20px ${activeTheme.glow}`,
        }}
      >
        <h1
          style={{
            fontSize: "64px",
            lineHeight: "70px",
            marginBottom: "30px",
          }}
        >
          Z Music V28
        </h1>

        <button
          onClick={() => setTheme((prev) => (prev + 1) % themes.length)}
          style={buttonStyle("#9be7e8")}
        >
          Toggle Theme
        </button>

        <button style={buttonStyle("#7CFC4E")}>Upload Music</button>

        <button style={buttonStyle("#ffbe0b")}>Start Recording</button>

        {/* Analytics */}
        <div
          style={{
            marginTop: "30px",
            padding: "20px",
            borderRadius: "20px",
            border: `2px solid ${activeTheme.glow}`,
            boxShadow: `0 0 20px ${activeTheme.glow}`,
          }}
        >
          <div
            style={{
              width: "25px",
              height: "25px",
              borderRadius: "50%",
              background: "#7CFC4E",
              boxShadow: "0 0 20px #7CFC4E",
              marginBottom: "20px",
            }}
          />

          <h2>READY</h2>

          <p>🎵 {tracks.length} Tracks</p>
          <p>🔥 2091 Plays</p>
          <p>📋 {queue.length} Queue</p>
          <p>❤️ {likedTracks.length} Likes</p>
        </div>

        {/* PLAYLISTS */}
        <div style={{ marginTop: "30px" }}>
          <h2>Playlists</h2>

          {["Night Drive", "Trending", "Workout", "Chill"].map((item) => (
            <div
              key={item}
              style={{
                padding: "15px",
                borderRadius: "14px",
                border: `2px solid ${activeTheme.glow}`,
                marginTop: "12px",
              }}
            >
              🎵 {item}
            </div>
          ))}
        </div>

        {/* RECENT */}
        <div style={{ marginTop: "30px" }}>
          <h2>Recently Played</h2>

          {recentTracks.map((track) => (
            <div
              key={track}
              style={{
                marginTop: "10px",
                padding: "12px",
                background: activeTheme.card,
                borderRadius: "12px",
              }}
            >
              🔥 {track}
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN */}
      <section
        style={{
          flex: 1,
          padding: "20px",
        }}
      >
        {/* SEARCH */}
        <input
          placeholder="Search music..."
          style={{
            width: "100%",
            padding: "24px",
            borderRadius: "20px",
            border: `2px solid ${activeTheme.glow}`,
            background: "#00106d",
            color: "white",
            fontSize: "32px",
            outline: "none",
            marginBottom: "30px",
          }}
        />

        {/* HERO */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "20px",
          }}
        >
          <div
            style={{
              background: activeTheme.card,
              borderRadius: "30px",
              padding: "30px",
              border: `2px solid ${activeTheme.glow}`,
              boxShadow: `0 0 30px ${activeTheme.glow}`,
            }}
          >
            <h3 style={{ color: activeTheme.accent }}>
              ZMUSIC NEXT GEN PLATFORM
            </h3>

            <h1
              style={{
                fontSize: "92px",
                lineHeight: "90px",
                marginTop: "20px",
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
                marginTop: "30px",
                fontSize: "20px",
                opacity: 0.7,
              }}
            >
              Futuristic streaming platform for creators.
            </p>
          </div>

          {/* TRENDING */}
          <div
            style={{
              background: "#00004d",
              borderRadius: "30px",
              padding: "30px",
              border: `2px solid ${activeTheme.glow}`,
            }}
          >
            <h1 style={{ fontSize: "60px" }}>Trending</h1>

            {trendingTracks.map((track) => (
              <div
                key={track.id}
                style={{
                  marginTop: "20px",
                  padding: "14px",
                  background: activeTheme.card,
                  borderRadius: "14px",
                }}
              >
                🔥 {track.title}
              </div>
            ))}
          </div>
        </div>

        {/* TRACKS */}
        <div style={{ marginTop: "40px", paddingBottom: "220px" }}>
          {tracks.map((track) => (
            <div
              key={track.id}
              style={{
                marginBottom: "40px",
                borderRadius: "30px",
                overflow: "hidden",
                border: `2px solid ${activeTheme.glow}`,
                background: activeTheme.card,
                boxShadow: `0 0 25px ${activeTheme.glow}`,
              }}
            >
              <img
                src={track.image}
                alt={track.title}
                style={{
                  width: "100%",
                  height: "340px",
                  objectFit: "cover",
                }}
              />

              <div style={{ padding: "30px" }}>
                <h1 style={{ fontSize: "70px" }}>{track.title}</h1>

                <h2 style={{ opacity: 0.7 }}>{track.artist}</h2>

                <div
                  style={{
                    display: "flex",
                    gap: "25px",
                    marginTop: "20px",
                    fontSize: "20px",
                    flexWrap: "wrap",
                  }}
                >
                  <span>🔥 {track.plays}</span>
                  <span>❤️ {track.likes}</span>
                  <span>🎵 {track.duration}</span>
                  <span>🧬 {track.genre}</span>
                  <span>⚡ {track.bpm} BPM</span>
                </div>

                {/* BUTTONS */}
                <div
                  style={{
                    display: "flex",
                    gap: "16px",
                    flexWrap: "wrap",
                    marginTop: "30px",
                  }}
                >
                  <button
                    onClick={() => playTrack(track)}
                    style={buttonStyle("#00d9ff")}
                  >
                    ▶ Play
                  </button>

                  <button
                    onClick={pauseTrack}
                    style={buttonStyle("#7CFC4E")}
                  >
                    ⏸ Pause
                  </button>

                  <button
                    onClick={() => likeTrack(track.id)}
                    style={buttonStyle("#ff2e97")}
                  >
                    ❤️ Like
                  </button>

                  <button
                    onClick={() => addToQueue(track)}
                    style={buttonStyle("#ffbe0b")}
                  >
                    ➕ Queue
                  </button>

                  <button style={buttonStyle("#7209b7")}>
                    ℹ Details
                  </button>

                  <button style={buttonStyle("#ff4d6d")}>
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* PLAYER */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 240,
            right: 0,
            background: "rgba(0,0,0,0.95)",
            backdropFilter: "blur(10px)",
            borderTop: `2px solid ${activeTheme.glow}`,
            padding: "20px",
            boxShadow: `0 0 20px ${activeTheme.glow}`,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <h2>
              {currentTrack ? currentTrack.title : "No Track Playing"}
            </h2>

            <h2>
              {Math.floor(progress)}s /{" "}
              {currentTrack ? currentTrack.duration : "0:00"}
            </h2>
          </div>

          {/* PROGRESS */}
          <div
            style={{
              width: "100%",
              height: "10px",
              background: "#444",
              borderRadius: "10px",
              marginTop: "12px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: activeTheme.glow,
                boxShadow: `0 0 20px ${activeTheme.glow}`,
              }}
            />
          </div>

          {/* CONTROLS */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "18px",
              marginTop: "22px",
              flexWrap: "wrap",
            }}
          >
            <button style={playerButton}>⏮</button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                ...playerButton,
                background: "#7CFC4E",
                color: "black",
              }}
            >
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </button>

            <button style={playerButton}>⏭</button>

            <button
              onClick={() => setShuffle(!shuffle)}
              style={{
                ...playerButton,
                background: shuffle ? "#ffbe0b" : "#555",
              }}
            >
              🔀
            </button>

            <button
              onClick={() => setRepeat(!repeat)}
              style={{
                ...playerButton,
                background: repeat ? "#ffbe0b" : "#555",
              }}
            >
              🔁
            </button>

            <span>🔊</span>

            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) =>
                setVolume(Number(e.target.value))
              }
            />

            <select
              value={playbackSpeed}
              onChange={(e) =>
                setPlaybackSpeed(Number(e.target.value))
              }
              style={{
                padding: "10px",
                borderRadius: "10px",
              }}
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>

            <button
              onClick={() => setFxEnabled(!fxEnabled)}
              style={{
                ...playerButton,
                background: fxEnabled ? "#7209b7" : "#333",
              }}
            >
              🌊 FX
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function buttonStyle(background: string) {
  return {
    background,
    color: "black",
    border: "none",
    padding: "18px 28px",
    borderRadius: "18px",
    fontSize: "18px",
    fontWeight: "bold" as const,
    cursor: "pointer",
    boxShadow: `0 0 15px ${background}`,
    marginBottom: "14px",
  };
}

const playerButton = {
  background: "#00d9ff",
  color: "black",
  border: "none",
  padding: "16px 22px",
  borderRadius: "16px",
  fontWeight: "bold" as const,
  fontSize: "18px",
  cursor: "pointer",
  boxShadow: "0 0 15px #00d9ff",
};
