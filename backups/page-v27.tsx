"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const starterTracks = [
    {
      id: 1,
      title: "Neon Dreams",
      artist: "Z Music",
      genre: "Electronic",
      bpm: 128,
      plays: 1201,
      likes: 32,
      duration: "3:45",
      favorite: true,
      cover:
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1600&auto=format&fit=crop",
      audio:
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },

    {
      id: 2,
      title: "Future Waves",
      artist: "Cyber Audio",
      genre: "Synthwave",
      bpm: 118,
      plays: 890,
      likes: 20,
      duration: "4:12",
      favorite: false,
      cover:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1600&auto=format&fit=crop",
      audio:
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    },
  ];

  const [tracks, setTracks] = useState(starterTracks);

  const [search, setSearch] = useState("");

  const [queue, setQueue] = useState<any[]>([]);

  const [recentlyPlayed, setRecentlyPlayed] = useState<any[]>([]);

  const [currentTrack, setCurrentTrack] = useState<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);

  const [duration, setDuration] = useState(0);

  const [volume, setVolume] = useState(0.5);

  const [shuffle, setShuffle] = useState(false);

  const [repeat, setRepeat] = useState(false);

  const [themeGlow, setThemeGlow] = useState("#00d9ff");

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const filteredTracks = useMemo(() => {
    return tracks.filter(
      (track) =>
        track.title.toLowerCase().includes(search.toLowerCase()) ||
        track.artist.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, tracks]);

  const playTrack = (track: any) => {
    if (!audioRef.current) return;

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

    setRecentlyPlayed((prev) => [
      track,
      ...prev.filter((p) => p.id !== track.id),
    ]);

    const colors = [
      "#00d9ff",
      "#ff00ff",
      "#9ef01a",
      "#ffbe0b",
      "#ff4d6d",
    ];

    setThemeGlow(
      colors[Math.floor(Math.random() * colors.length)]
    );
  };

  const pauseTrack = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const nextTrack = () => {
    if (!currentTrack) return;

    let next;

    if (shuffle) {
      next =
        tracks[
          Math.floor(Math.random() * tracks.length)
        ];
    } else {
      const index = tracks.findIndex(
        (t) => t.id === currentTrack.id
      );

      next = tracks[(index + 1) % tracks.length];
    }

    playTrack(next);
  };

  const previousTrack = () => {
    if (!currentTrack) return;

    const index = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );

    const prev =
      tracks[
        (index - 1 + tracks.length) %
          tracks.length
      ];

    playTrack(prev);
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

  const addToQueue = (track: any) => {
    setQueue((prev) => [...prev, track]);
  };

  const removeTrack = (id: number) => {
    setTracks((prev) =>
      prev.filter((track) => track.id !== id)
    );
  };

  const uploadMusic = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const newTrack = {
      id: Date.now(),
      title: file.name.replace(".mp3", ""),
      artist: "Uploaded Artist",
      genre: "Custom",
      bpm: 120,
      plays: 0,
      likes: 0,
      duration: "Unknown",
      favorite: false,
      cover:
        "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1600&auto=format&fit=crop",
      audio: URL.createObjectURL(file),
    };

    setTracks((prev) => [newTrack, ...prev]);
  };

  return (
    <div
      style={{
        background: "#02135e",
        minHeight: "100vh",
        color: "white",
        display: "flex",
        fontFamily: "Arial",
      }}
    >
      <audio
        ref={audioRef}
        onEnded={() => {
          if (repeat && currentTrack) {
            playTrack(currentTrack);
          } else {
            nextTrack();
          }
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
        }}
      />

      {/* SIDEBAR */}
      <div
        style={{
          width: 260,
          padding: 20,
          borderRight: `2px solid ${themeGlow}`,
          background: "#04135d",
        }}
      >
        <h1
          style={{
            fontSize: 72,
            lineHeight: 1,
          }}
        >
          Z Music
          <br />
          V27
        </h1>

        <button style={button("#90e0ef")}>
          Toggle Theme
        </button>

        <label>
          <div style={button("#70e000")}>
            Upload Music
          </div>

          <input
            type="file"
            accept=".mp3"
            onChange={uploadMusic}
            style={{ display: "none" }}
          />
        </label>

        <button style={button("#ffbe0b")}>
          Start Recording
        </button>

        <div
          style={{
            marginTop: 20,
            padding: 20,
            borderRadius: 20,
            border: `2px solid ${themeGlow}`,
            background: "#001845",
            boxShadow: `0 0 20px ${themeGlow}`,
          }}
        >
          <div
            style={{
              width: 25,
              height: 25,
              borderRadius: "50%",
              background: "#70e000",
              boxShadow: "0 0 20px #70e000",
            }}
          />

          <h2>READY</h2>

          <p>🎵 {tracks.length} Tracks</p>

          <p>
            🔥{" "}
            {tracks.reduce(
              (acc, t) => acc + t.plays,
              0
            )}{" "}
            Plays
          </p>

          <p>📋 {queue.length} Queue</p>
        </div>

        {/* PLAYLISTS */}
        <div style={{ marginTop: 30 }}>
          <h2>Playlists</h2>

          {[
            "Night Drive",
            "Trending",
            "Workout",
            "Chill",
          ].map((playlist) => (
            <div
              key={playlist}
              style={playlistStyle}
            >
              🎵 {playlist}
            </div>
          ))}
        </div>

        {/* RECENT */}
        <div style={{ marginTop: 30 }}>
          <h2>Recently Played</h2>

          {recentlyPlayed.slice(0, 5).map((track) => (
            <div
              key={track.id}
              style={playlistStyle}
            >
              🔥 {track.title}
            </div>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div
        style={{
          flex: 1,
          padding: 24,
          paddingBottom: 220,
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
            padding: 20,
            fontSize: 30,
            borderRadius: 20,
            border: `2px solid ${themeGlow}`,
            background: "#04107a",
            color: "white",
            marginBottom: 30,
          }}
        />

        {/* HERO */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 24,
            marginBottom: 30,
          }}
        >
          <div
            style={{
              border: `2px solid ${themeGlow}`,
              borderRadius: 30,
              padding: 30,
              background: "#041f86",
              boxShadow: `0 0 25px ${themeGlow}`,
            }}
          >
            <h3 style={{ color: "#9ef01a" }}>
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
                fontSize: 22,
                opacity: 0.7,
              }}
            >
              Futuristic streaming platform for creators.
            </p>
          </div>

          <div
            style={{
              border: `2px solid ${themeGlow}`,
              borderRadius: 30,
              padding: 30,
              background: "#02004f",
            }}
          >
            <h1>Trending</h1>

            {tracks.slice(0, 5).map((track) => (
              <p key={track.id}>
                🔥 {track.title}
              </p>
            ))}
          </div>
        </div>

        {/* TRACKS */}
        {filteredTracks.map((track) => (
          <div
            key={track.id}
            style={{
              marginBottom: 30,
              border: `2px solid ${themeGlow}`,
              borderRadius: 30,
              overflow: "hidden",
              background: "#041f86",
              boxShadow:
                currentTrack?.id === track.id
                  ? `0 0 30px ${themeGlow}`
                  : "none",
            }}
          >
            <img
              src={track.cover}
              style={{
                width: "100%",
                height: 350,
                objectFit: "cover",
              }}
            />

            <div style={{ padding: 24 }}>
              <h1 style={{ fontSize: 60 }}>
                {track.title}
              </h1>

              <h2>{track.artist}</h2>

              <div
                style={{
                  display: "flex",
                  gap: 20,
                  flexWrap: "wrap",
                  marginTop: 20,
                  fontSize: 22,
                }}
              >
                <span>🔥 {track.plays}</span>
                <span>❤️ {track.likes}</span>
                <span>🎵 {track.duration}</span>
                <span>🧬 {track.genre}</span>
                <span>⚡ {track.bpm} BPM</span>
              </div>

              {/* VISUALIZER */}
              {currentTrack?.id === track.id &&
                isPlaying && (
                  <div
                    style={{
                      display: "flex",
                      gap: 5,
                      marginTop: 20,
                      alignItems: "end",
                      height: 70,
                    }}
                  >
                    {Array.from({
                      length: 50,
                    }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          width: 6,
                          height:
                            10 +
                            Math.random() * 60,
                          background: themeGlow,
                          borderRadius: 20,
                          boxShadow: `0 0 12px ${themeGlow}`,
                        }}
                      />
                    ))}
                  </div>
                )}

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginTop: 24,
                }}
              >
                <button
                  onClick={() =>
                    playTrack(track)
                  }
                  style={button("#00d9ff")}
                >
                  ▶ Play
                </button>

                <button
                  onClick={pauseTrack}
                  style={button("#9ef01a")}
                >
                  ⏸ Pause
                </button>

                <button
                  onClick={() =>
                    likeTrack(track.id)
                  }
                  style={button("#f72585")}
                >
                  ❤️ Like
                </button>

                <button
                  onClick={() =>
                    addToQueue(track)
                  }
                  style={button("#ffbe0b")}
                >
                  ➕ Queue
                </button>

                <button
                  style={button("#7209b7")}
                >
                  ℹ Details
                </button>

                <button
                  onClick={() =>
                    removeTrack(track.id)
                  }
                  style={button("#ff4d6d")}
                >
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
          left: 260,
          right: 0,
          bottom: 0,
          background:
            "linear-gradient(to right,#000,#111)",
          padding: 20,
          borderTop: `2px solid ${themeGlow}`,
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <strong>
            {currentTrack
              ? currentTrack.title
              : "No Track Playing"}
          </strong>

          <strong>
            {Math.floor(currentTime)}s /
            {Math.floor(duration)}s
          </strong>
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
            marginTop: 10,
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            marginTop: 20,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={previousTrack}
            style={button("#00d9ff")}
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
            style={button("#9ef01a")}
          >
            {isPlaying
              ? "⏸ Pause"
              : "▶ Play"}
          </button>

          <button
            onClick={nextTrack}
            style={button("#00d9ff")}
          >
            ⏭
          </button>

          <button
            onClick={() =>
              setShuffle(!shuffle)
            }
            style={button(
              shuffle
                ? "#f72585"
                : "#666"
            )}
          >
            🔀
          </button>

          <button
            onClick={() =>
              setRepeat(!repeat)
            }
            style={button(
              repeat
                ? "#7209b7"
                : "#666"
            )}
          >
            🔁
          </button>

          <span>🔊</span>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) =>
              setVolume(Number(e.target.value))
            }
          />

          <button
            style={button("#7209b7")}
          >
            🌊 FX
          </button>
        </div>
      </div>
    </div>
  );
}

function button(color: string) {
  return {
    background: color,
    color: "black",
    border: "none",
    padding: "16px 24px",
    borderRadius: 16,
    fontWeight: "bold" as const,
    fontSize: 22,
    cursor: "pointer",
    boxShadow: `0 0 12px ${color}`,
  };
}

const playlistStyle = {
  border: "2px solid #00d9ff",
  borderRadius: 14,
  padding: 14,
  marginTop: 10,
  background: "#06154d",
  cursor: "pointer",
};
