"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Song = {
  id: number;
  artist: string;
  title: string;
  genre: string;
  playlist: string;
  duration: string;
  image: string;
  audio: string;
  favorite: boolean;
  plays: number;
  rating: number;
  addedAt: number;
  color: string;
  lyrics: string;
};

const starterSongs: Song[] = [
  {
    id: 1,
    artist: "Drake",
    title: "God's Plan",
    genre: "Hip Hop",
    playlist: "Hits",
    duration: "6:12",
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop",
    audio:
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    favorite: true,
    plays: 0,
    rating: 5,
    addedAt: Date.now(),
    color: "#00d9ff",
    lyrics: "Started from the bottom now we here...",
  },
];

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [songs, setSongs] = useState<Song[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] =
    useState<Song | null>(null);

  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [playlist, setPlaylist] = useState("");
  const [lyrics, setLyrics] = useState("");

  const [audioData, setAudioData] =
    useState("");
  const [coverData, setCoverData] =
    useState("");

  const [search, setSearch] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] =
    useState("All");

  const [playing, setPlaying] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [duration, setDuration] =
    useState(0);

  const [volume, setVolume] =
    useState(1);

  const [favoritesOnly, setFavoritesOnly] =
    useState(false);

  const [themeColor, setThemeColor] =
    useState("#00d9ff");

  const [sortMode, setSortMode] =
    useState("newest");

  const [recentlyPlayed, setRecentlyPlayed] =
    useState<Song[]>([]);

  const [repeat, setRepeat] =
    useState(false);

  const [autoplay, setAutoplay] =
    useState(true);

  const [muted, setMuted] =
    useState(false);

  const [showLyrics, setShowLyrics] =
    useState(false);

  const [showVisualizer, setShowVisualizer] =
    useState(true);

  const [focusMode, setFocusMode] =
    useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(
      "zmusic-v10"
    );

    setSongs(saved ? JSON.parse(saved) : starterSongs);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "zmusic-v10",
      JSON.stringify(songs)
    );
  }, [songs]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = muted
        ? 0
        : volume;
    }
  }, [volume, muted]);

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }

      if (e.key === "n") nextSong();

      if (e.key === "m")
        setMuted((v) => !v);

      if (e.key === "l")
        setShowLyrics((v) => !v);

      if (e.key === "f")
        setFocusMode((v) => !v);
    };

    window.addEventListener(
      "keydown",
      keyHandler
    );

    return () =>
      window.removeEventListener(
        "keydown",
        keyHandler
      );
  }, [currentSong]);

  const playlists = useMemo(() => {
    return [
      "All",
      ...Array.from(
        new Set(songs.map((s) => s.playlist))
      ),
    ];
  }, [songs]);

  let filteredSongs = songs.filter((song) => {
    const text = search.toLowerCase();

    return (
      (song.artist
        .toLowerCase()
        .includes(text) ||
        song.title
          .toLowerCase()
          .includes(text) ||
        song.genre
          .toLowerCase()
          .includes(text)) &&
      (selectedPlaylist === "All" ||
        song.playlist ===
          selectedPlaylist) &&
      (!favoritesOnly || song.favorite)
    );
  });

  if (sortMode === "newest") {
    filteredSongs.sort(
      (a, b) => b.addedAt - a.addedAt
    );
  }

  if (sortMode === "mostPlayed") {
    filteredSongs.sort(
      (a, b) => b.plays - a.plays
    );
  }

  const fileToDataUrl = (
    file: File,
    callback: (value: string) => void
  ) => {
    const reader = new FileReader();

    reader.onload = () =>
      callback(String(reader.result));

    reader.readAsDataURL(file);
  };

  const saveSong = () => {
    if (!artist || !title || !audioData)
      return;

    const newSong: Song = {
      id: Date.now(),
      artist,
      title,
      genre: genre || "Unknown",
      playlist: playlist || "Uploads",
      duration: "Auto",
      image:
        coverData ||
        "https://cdn-icons-png.flaticon.com/512/727/727245.png",
      audio: audioData,
      favorite: false,
      plays: 0,
      rating: 5,
      addedAt: Date.now(),
      color: themeColor,
      lyrics,
    };

    setSongs([newSong, ...songs]);

    setArtist("");
    setTitle("");
    setGenre("");
    setPlaylist("");
    setLyrics("");
    setAudioData("");
    setCoverData("");
  };

  const playSong = (song: Song) => {
    setCurrentSong(song);

    setSongs((prev) =>
      prev.map((s) =>
        s.id === song.id
          ? { ...s, plays: s.plays + 1 }
          : s
      )
    );

    setRecentlyPlayed((prev) => {
      const filtered = prev.filter(
        (s) => s.id !== song.id
      );

      return [song, ...filtered].slice(0, 10);
    });

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.src = song.audio;
        audioRef.current.play();
      }
    }, 100);
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentSong)
      return;

    if (audioRef.current.paused) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  };

  const nextSong = () => {
    if (queue.length > 0) {
      const next = queue[0];

      setQueue(queue.slice(1));

      playSong(next);

      return;
    }

    if (!filteredSongs.length) return;

    const index = filteredSongs.findIndex(
      (s) => s.id === currentSong?.id
    );

    playSong(
      filteredSongs[
        (index + 1) % filteredSongs.length
      ]
    );
  };

  return (
    <div
      style={{
        ...page,
        background: focusMode
          ? "#000"
          : "linear-gradient(135deg,#000428,#004e92)",
      }}
    >
      <aside style={sidebar}>
        <h1>Z Music V10</h1>

        <p>🎵 Songs: {songs.length}</p>

        <p>
          ⭐ Favorites:
          {
            songs.filter((s) => s.favorite)
              .length
          }
        </p>

        <p>
          🔥 Total Plays:
          {songs.reduce(
            (a, b) => a + b.plays,
            0
          )}
        </p>

        <h3>Playlists</h3>

        {playlists.map((p) => (
          <button
            key={p}
            style={{
              ...sideButton,
              background:
                selectedPlaylist === p
                  ? "#ffe600"
                  : "#334155",
              color:
                selectedPlaylist === p
                  ? "#111"
                  : "white",
            }}
            onClick={() =>
              setSelectedPlaylist(p)
            }
          >
            {p}
          </button>
        ))}

        <h3 style={{ marginTop: 25 }}>
          Themes
        </h3>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {[
            "#00d9ff",
            "#ff3d00",
            "#9b5de5",
            "#80ed99",
            "#ffe600",
            "#ff74b1",
          ].map((c) => (
            <div
              key={c}
              onClick={() =>
                setThemeColor(c)
              }
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: c,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </aside>

      <main style={main}>
        <h1 style={titleStyle}>
          Music Data Base
        </h1>

        <input
          placeholder="Search Music"
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          style={input}
        />

        <select
          value={sortMode}
          onChange={(e) =>
            setSortMode(e.target.value)
          }
          style={input}
        >
          <option value="newest">
            Sort Newest
          </option>

          <option value="mostPlayed">
            Most Played
          </option>
        </select>

        <div style={stats}>
          <Box
            label="Songs"
            value={songs.length}
          />

          <Box
            label="Favorites"
            value={
              songs.filter((s) => s.favorite)
                .length
            }
          />

          <Box
            label="Queue"
            value={queue.length}
          />

          <Box
            label="Plays"
            value={songs.reduce(
              (a, b) => a + b.plays,
              0
            )}
          />
        </div>

        <div style={form}>
          <input
            placeholder="Artist Name"
            value={artist}
            onChange={(e) =>
              setArtist(e.target.value)
            }
            style={input}
          />

          <input
            placeholder="Song Name"
            value={title}
            onChange={(e) =>
              setTitle(e.target.value)
            }
            style={input}
          />

          <input
            placeholder="Genre"
            value={genre}
            onChange={(e) =>
              setGenre(e.target.value)
            }
            style={input}
          />

          <input
            placeholder="Playlist"
            value={playlist}
            onChange={(e) =>
              setPlaylist(e.target.value)
            }
            style={input}
          />

          <textarea
            placeholder="Song Lyrics"
            value={lyrics}
            onChange={(e) =>
              setLyrics(e.target.value)
            }
            style={{
              ...input,
              minHeight: 120,
            }}
          />

          <div style={uploadBox}>
            <strong>🎵 Upload MP3</strong>

            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file =
                  e.target.files?.[0];

                if (file)
                  fileToDataUrl(
                    file,
                    setAudioData
                  );
              }}
            />

            <strong>
              🖼 Upload Album Cover
            </strong>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file =
                  e.target.files?.[0];

                if (file)
                  fileToDataUrl(
                    file,
                    setCoverData
                  );
              }}
            />
          </div>

          <div style={buttons}>
            <button
              style={blue}
              onClick={saveSong}
            >
              Save Upload
            </button>

            <button
              style={yellow}
              onClick={() =>
                setFavoritesOnly(
                  !favoritesOnly
                )
              }
            >
              Favorites
            </button>

            <button
              style={green}
              onClick={() =>
                setShowVisualizer(
                  !showVisualizer
                )
              }
            >
              Visualizer
            </button>

            <button
              style={red}
              onClick={() =>
                setSongs(starterSongs)
              }
            >
              Reset
            </button>
          </div>
        </div>

        <h2>Recently Played</h2>

        <div style={recentRow}>
          {recentlyPlayed.map((song) => (
            <div
              key={song.id}
              style={recentCard}
            >
              <img
                src={song.image}
                style={recentImage}
              />

              <div style={{ padding: 10 }}>
                <strong>
                  {song.title}
                </strong>

                <div>{song.artist}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={grid}>
          {filteredSongs.map((song) => (
            <div
              key={song.id}
              style={{
                ...card,
                border:
                  currentSong?.id === song.id
                    ? "3px solid #ffe600"
                    : `2px solid ${song.color}`,
              }}
            >
              <img
                src={song.image}
                style={cover}
              />

              <div style={body}>
                <h2>{song.artist}</h2>

                <h3>{song.title}</h3>

                <p>
                  Genre: {song.genre}
                </p>

                <p>
                  Playlist:
                  {song.playlist}
                </p>

                <p>Plays: {song.plays}</p>

                <div
                  style={{
                    display: "flex",
                    gap: 5,
                    marginBottom: 10,
                  }}
                >
                  {[1, 2, 3, 4, 5].map(
                    (star) => (
                      <span
                        key={star}
                        onClick={() =>
                          setSongs((prev) =>
                            prev.map((s) =>
                              s.id === song.id
                                ? {
                                    ...s,
                                    rating: star,
                                  }
                                : s
                            )
                          )
                        }
                        style={{
                          cursor: "pointer",
                          fontSize: 20,
                        }}
                      >
                        {star <= song.rating
                          ? "⭐"
                          : "☆"}
                      </span>
                    )
                  )}
                </div>

                <div style={buttons}>
                  <button
                    style={blue}
                    onClick={() =>
                      playSong(song)
                    }
                  >
                    Play
                  </button>

                  <button
                    style={white}
                    onClick={() =>
                      setQueue([
                        ...queue,
                        song,
                      ])
                    }
                  >
                    Queue
                  </button>

                  <button
                    style={yellow}
                    onClick={() =>
                      setSongs(
                        songs.map((s) =>
                          s.id === song.id
                            ? {
                                ...s,
                                favorite:
                                  !s.favorite,
                              }
                            : s
                        )
                      )
                    }
                  >
                    {song.favorite
                      ? "♥"
                      : "♡"}
                  </button>

                  <button
                    style={green}
                    onClick={() =>
                      setShowLyrics(true)
                    }
                  >
                    Lyrics
                  </button>

                  <button
                    style={red}
                    onClick={() =>
                      setSongs(
                        songs.filter(
                          (s) =>
                            s.id !== song.id
                        )
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {showLyrics && currentSong && (
        <div style={lyricsPanel}>
          <h1>{currentSong.title}</h1>

          <h2>{currentSong.artist}</h2>

          <div style={lyricsText}>
            {currentSong.lyrics ||
              "No lyrics added."}
          </div>

          <button
            style={red}
            onClick={() =>
              setShowLyrics(false)
            }
          >
            Close Lyrics
          </button>
        </div>
      )}

      <footer style={player}>
        <div>
          <strong>Now Playing</strong>

          <div>
            {currentSong
              ? `${currentSong.artist} - ${currentSong.title}`
              : "No song playing"}
          </div>
        </div>

        {showVisualizer && (
          <Visualizer playing={playing} />
        )}

        <button
          style={blue}
          onClick={togglePlay}
        >
          {playing ? "Pause" : "Play"}
        </button>

        <button
          style={green}
          onClick={nextSong}
        >
          Next
        </button>

        <button
          style={yellow}
          onClick={() =>
            setRepeat(!repeat)
          }
        >
          {repeat
            ? "Repeat ON"
            : "Repeat"}
        </button>

        <button
          style={white}
          onClick={() =>
            setAutoplay(!autoplay)
          }
        >
          {autoplay
            ? "Autoplay ON"
            : "Autoplay"}
        </button>

        <button
          style={blue}
          onClick={() =>
            setMuted(!muted)
          }
        >
          {muted ? "Unmute" : "Mute"}
        </button>

        <span>{progress.toFixed(0)}</span>

        <input
          type="range"
          min="0"
          max={duration || 0}
          value={progress}
          onChange={(e) => {
            const value = Number(
              e.target.value
            );

            if (audioRef.current)
              audioRef.current.currentTime =
                value;

            setProgress(value);
          }}
          style={{ flex: 1 }}
        />

        <span>{duration.toFixed(0)}</span>

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
          style={{ width: 100 }}
        />

        <audio
          ref={audioRef}
          onTimeUpdate={(e) =>
            setProgress(
              e.currentTarget.currentTime
            )
          }
          onLoadedMetadata={(e) =>
            setDuration(
              e.currentTarget.duration
            )
          }
          onPlay={() => setPlaying(true)}
          onPause={() =>
            setPlaying(false)
          }
          onEnded={() => {
            if (repeat && currentSong) {
              playSong(currentSong);
              return;
            }

            if (autoplay) {
              nextSong();
            }
          }}
        />
      </footer>
    </div>
  );
}

function Box({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div style={statBox}>
      <strong>{label}</strong>

      <div
        style={{
          fontSize: 32,
          fontWeight: "bold",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Visualizer({
  playing,
}: {
  playing: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        alignItems: "flex-end",
        height: 35,
      }}
    >
      {[10, 18, 30, 22, 14].map(
        (h, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: playing ? h : 8,
              background: "#72f1ff",
              borderRadius: 10,
              transition: ".25s",
            }}
          />
        )
      )}
    </div>
  );
}

const page = {
  minHeight: "100vh",
  display: "flex",
  color: "white",
  fontFamily: "Arial",
};

const sidebar = {
  width: 220,
  padding: 20,
  borderRight: "2px solid #00d9ff",
  background: "rgba(0,0,0,.35)",
  position: "fixed" as const,
  left: 0,
  top: 0,
  bottom: 0,
  overflowY: "auto" as const,
};

const main = {
  marginLeft: 220,
  flex: 1,
  padding: "30px 30px 120px",
};

const titleStyle = {
  fontSize: 56,
};

const input = {
  width: "100%",
  padding: 15,
  borderRadius: 14,
  border: "2px solid #00d9ff",
  background: "rgba(0,0,40,.55)",
  color: "white",
  marginBottom: 12,
};

const stats = {
  display: "flex",
  gap: 15,
  margin: "20px 0",
  flexWrap: "wrap" as const,
};

const statBox = {
  width: 125,
  padding: 16,
  border: "2px solid #4de3ff",
  borderRadius: 18,
  background: "rgba(0,0,0,.4)",
};

const form = {
  display: "grid",
  gap: 10,
  marginBottom: 30,
};

const uploadBox = {
  padding: 18,
  border: "2px dashed #00d9ff",
  borderRadius: 18,
  background: "rgba(0,0,0,.35)",
  display: "grid",
  gap: 10,
};

const buttons = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap" as const,
};

const grid = {
  display: "grid",
  gridTemplateColumns:
    "repeat(auto-fit,minmax(300px,1fr))",
  gap: 22,
};

const card = {
  borderRadius: 24,
  overflow: "hidden",
  background: "rgba(0,0,50,.6)",
};

const cover = {
  width: "100%",
  height: 220,
  objectFit: "cover" as const,
};

const body = {
  padding: 18,
};

const player = {
  position: "fixed" as const,
  bottom: 0,
  left: 220,
  right: 0,
  height: 85,
  background: "rgba(0,0,40,.9)",
  borderTop: "2px solid #00d9ff",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 20px",
};

const recentRow = {
  display: "flex",
  gap: 15,
  overflowX: "auto" as const,
  marginBottom: 30,
};

const recentCard = {
  minWidth: 180,
  background: "rgba(0,0,0,.35)",
  borderRadius: 16,
  overflow: "hidden",
  border: "2px solid #00d9ff",
};

const recentImage = {
  width: "100%",
  height: 120,
  objectFit: "cover" as const,
};

const lyricsPanel = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(0,0,0,.96)",
  zIndex: 9999,
  padding: 50,
  overflowY: "auto" as const,
};

const lyricsText = {
  marginTop: 20,
  whiteSpace: "pre-wrap" as const,
  lineHeight: 1.8,
  fontSize: 20,
};

const sideButton = {
  width: "100%",
  marginBottom: 10,
  padding: 10,
  borderRadius: 10,
  border: "none",
  fontWeight: "bold",
};

const blue = {
  background: "#2de2ff",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: "bold",
  cursor: "pointer",
};

const green = {
  background: "#80ed99",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: "bold",
  cursor: "pointer",
};

const yellow = {
  background: "#ffe600",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: "bold",
  cursor: "pointer",
};

const red = {
  background: "#ff74b1",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: "bold",
  cursor: "pointer",
};

const white = {
  background: "white",
  border: "none",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: "bold",
  cursor: "pointer",
};