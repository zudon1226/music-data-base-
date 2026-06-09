"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PageType =
  | "home"
  | "discover"
  | "library"
  | "studio"
  | "analytics"
  | "profile";

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
  const [page, setPage] = useState<PageType>("home");
  const [theme, setTheme] = useState(0);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(70);
  const [queue, setQueue] = useState<Track[]>([]);
  const [likes, setLikes] = useState<number[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [fxEnabled, setFxEnabled] = useState(false);

  const visualizerRef = useRef<number[]>([]);

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

  useEffect(() => {
    visualizerRef.current = Array.from({ length: 40 }, () =>
      Math.floor(Math.random() * 100)
    );

    const interval = setInterval(() => {
      visualizerRef.current = visualizerRef.current.map(
        () => Math.floor(Math.random() * 100)
      );
    }, 200);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isPlaying) {
      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 100;
          }
          return prev + 0.3;
        });
      }, 100);
    }

    return () => clearInterval(interval);
  }, [isPlaying]);

  const playTrack = (track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
  };

  const likeTrack = (id: number) => {
    if (!likes.includes(id)) {
      setLikes((prev) => [...prev, id]);
    }
  };

  const addQueue = (track: Track) => {
    setQueue((prev) => [...prev, track]);
  };

  return (
    <main
      style={{
        background: activeTheme.bg,
        minHeight: "100vh",
        display: "flex",
        color: "white",
        fontFamily: "Arial",
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: "250px",
          padding: "20px",
          background: "#00104a",
          borderRight: `2px solid ${activeTheme.glow}`,
          boxShadow: `0 0 25px ${activeTheme.glow}`,
          position: "fixed",
          top: 0,
          bottom: 0,
          overflowY: "auto",
        }}
      >
        <h1
          style={{
            fontSize: "70px",
            lineHeight: "72px",
            marginBottom: "30px",
          }}
        >
          Z Music
          <br />
          V29
        </h1>

        <button
          onClick={() =>
            setTheme((prev) => (prev + 1) % themes.length)
          }
          style={buttonStyle("#9be7e8")}
        >
          Toggle Theme
        </button>

        <button style={buttonStyle("#7CFC4E")}>
          Upload Music
        </button>

        <button style={buttonStyle("#ffbe0b")}>
          Start Recording
        </button>

        {/* NAVIGATION */}
        <div style={{ marginTop: "30px" }}>
          {[
            "home",
            "discover",
            "library",
            "studio",
            "analytics",
            "profile",
          ].map((item) => (
            <div
              key={item}
              onClick={() => setPage(item as PageType)}
              style={{
                padding: "16px",
                borderRadius: "16px",
                marginBottom: "12px",
                cursor: "pointer",
                background:
                  page === item
                    ? activeTheme.glow
                    : activeTheme.card,
                color: page === item ? "black" : "white",
                fontWeight: "bold",
              }}
            >
              {item.toUpperCase()}
            </div>
          ))}
        </div>

        {/* ANALYTICS */}
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
          <p>❤️ {likes.length} Likes</p>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <section
        style={{
          marginLeft: "250px",
          flex: 1,
          padding: "20px",
          paddingBottom: "220px",
        }}
      >
        {/* HOME */}
        {page === "home" && (
          <>
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
                marginBottom: "30px",
                outline: "none",
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
                    fontSize: "96px",
                    lineHeight: "92px",
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
                    marginTop: "20px",
                    fontSize: "22px",
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

                {tracks.map((track) => (
                  <div
                    key={track.id}
                    style={{
                      marginTop: "20px",
                      padding: "18px",
                      background: activeTheme.card,
                      borderRadius: "16px",
                    }}
                  >
                    🔥 {track.title}
                  </div>
                ))}
              </div>
            </div>

            {/* TRACK LIST */}
            <div style={{ marginTop: "40px" }}>
              {tracks.map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  glow={activeTheme.glow}
                  card={activeTheme.card}
                  playTrack={playTrack}
                  likeTrack={likeTrack}
                  addQueue={addQueue}
                />
              ))}
            </div>
          </>
        )}

        {/* DISCOVER */}
        {page === "discover" && (
          <PageContainer
            title="Discover"
            glow={activeTheme.glow}
          >
            <h2>🔥 Trending Music</h2>
            <h2>🎧 Recommended Tracks</h2>
            <h2>🌌 Electronic</h2>
            <h2>🌊 Synthwave</h2>
            <h2>⚡ Future Bass</h2>
          </PageContainer>
        )}

        {/* LIBRARY */}
        {page === "library" && (
          <PageContainer
            title="Your Library"
            glow={activeTheme.glow}
          >
            {queue.map((track) => (
              <div
                key={track.id}
                style={{
                  marginBottom: "18px",
                  padding: "20px",
                  background: activeTheme.card,
                  borderRadius: "18px",
                }}
              >
                🎵 {track.title}
              </div>
            ))}
          </PageContainer>
        )}

        {/* STUDIO */}
        {page === "studio" && (
          <PageContainer
            title="Studio Mode"
            glow={activeTheme.glow}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "20px",
              }}
            >
              <div
                style={{
                  background: activeTheme.card,
                  borderRadius: "20px",
                  padding: "30px",
                }}
              >
                <h2>🎤 Recording Console</h2>

                <button style={buttonStyle("#ff006e")}>
                  Record
                </button>

                <button style={buttonStyle("#00d9ff")}>
                  Export
                </button>
              </div>

              <div
                style={{
                  background: activeTheme.card,
                  borderRadius: "20px",
                  padding: "30px",
                }}
              >
                <h2>🎛 Beat Pads</h2>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4,1fr)",
                    gap: "12px",
                    marginTop: "20px",
                  }}
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        height: "80px",
                        borderRadius: "14px",
                        background: activeTheme.glow,
                        boxShadow: `0 0 20px ${activeTheme.glow}`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* VISUALIZER */}
            <div
              style={{
                marginTop: "40px",
                height: "180px",
                display: "flex",
                alignItems: "flex-end",
                gap: "6px",
              }}
            >
              {visualizerRef.current.map((bar, index) => (
                <div
                  key={index}
                  style={{
                    width: "18px",
                    height: `${bar + 20}px`,
                    background: activeTheme.glow,
                    borderRadius: "20px",
                    boxShadow: `0 0 20px ${activeTheme.glow}`,
                    transition: "0.2s",
                  }}
                />
              ))}
            </div>
          </PageContainer>
        )}

        {/* ANALYTICS */}
        {page === "analytics" && (
          <PageContainer
            title="Analytics"
            glow={activeTheme.glow}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: "20px",
              }}
            >
              {[
                "2091 Streams",
                "321 Followers",
                "92 Likes",
                "12 Playlists",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    background: activeTheme.card,
                    borderRadius: "20px",
                    padding: "30px",
                    textAlign: "center",
                    fontSize: "28px",
                    boxShadow: `0 0 20px ${activeTheme.glow}`,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </PageContainer>
        )}

        {/* PROFILE */}
        {page === "profile" && (
          <PageContainer
            title="Creator Profile"
            glow={activeTheme.glow}
          >
            <div
              style={{
                background: activeTheme.card,
                padding: "40px",
                borderRadius: "30px",
              }}
            >
              <div
                style={{
                  width: "140px",
                  height: "140px",
                  borderRadius: "50%",
                  background: activeTheme.glow,
                  marginBottom: "20px",
                }}
              />

              <h1>Z Music</h1>

              <p>Cyberpunk electronic creator platform.</p>

              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  marginTop: "20px",
                }}
              >
                <span>🔥 2K Plays</span>
                <span>❤️ 92 Likes</span>
                <span>👥 321 Followers</span>
              </div>
            </div>
          </PageContainer>
        )}
      </section>

      {/* PLAYER */}
      <div
        style={{
          position: "fixed",
          left: "250px",
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.95)",
          borderTop: `2px solid ${activeTheme.glow}`,
          padding: "20px",
          backdropFilter: "blur(10px)",
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
            {currentTrack?.duration || "0:00"}
          </h2>
        </div>

        {/* PROGRESS */}
        <div
          style={{
            width: "100%",
            height: "10px",
            background: "#333",
            borderRadius: "10px",
            overflow: "hidden",
            marginTop: "12px",
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

        {/* PLAYER CONTROLS */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginTop: "20px",
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
            value={volume}
            min="0"
            max="100"
            onChange={(e) =>
              setVolume(Number(e.target.value))
            }
          />

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
    </main>
  );
}

/* TRACK CARD */
function TrackCard({
  track,
  glow,
  card,
  playTrack,
  likeTrack,
  addQueue,
}: any) {
  return (
    <div
      style={{
        marginBottom: "40px",
        borderRadius: "30px",
        overflow: "hidden",
        background: card,
        border: `2px solid ${glow}`,
        boxShadow: `0 0 25px ${glow}`,
      }}
    >
      <img
        src={track.image}
        alt={track.title}
        style={{
          width: "100%",
          height: "320px",
          objectFit: "cover",
        }}
      />

      <div style={{ padding: "30px" }}>
        <h1 style={{ fontSize: "70px" }}>{track.title}</h1>

        <h2 style={{ opacity: 0.7 }}>{track.artist}</h2>

        <div
          style={{
            display: "flex",
            gap: "20px",
            marginTop: "20px",
            flexWrap: "wrap",
            fontSize: "20px",
          }}
        >
          <span>🔥 {track.plays}</span>
          <span>❤️ {track.likes}</span>
          <span>🎵 {track.duration}</span>
          <span>🧬 {track.genre}</span>
          <span>⚡ {track.bpm} BPM</span>
        </div>

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

          <button style={buttonStyle("#7CFC4E")}>
            ⏸ Pause
          </button>

          <button
            onClick={() => likeTrack(track.id)}
            style={buttonStyle("#ff2e97")}
          >
            ❤️ Like
          </button>

          <button
            onClick={() => addQueue(track)}
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
  );
}

/* PAGE CONTAINER */
function PageContainer({
  title,
  glow,
  children,
}: any) {
  return (
    <div
      style={{
        borderRadius: "30px",
        border: `2px solid ${glow}`,
        boxShadow: `0 0 25px ${glow}`,
        padding: "30px",
      }}
    >
      <h1 style={{ fontSize: "70px" }}>{title}</h1>

      <div style={{ marginTop: "30px" }}>{children}</div>
    </div>
  );
}

/* BUTTONS */
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
