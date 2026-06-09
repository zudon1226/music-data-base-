"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Track = {
  id: string;
  title: string;
  artist: string;
  url: string;
  image: string;
  likes: number;
  plays: number;
  addedAt: number;
};

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  const [search, setSearch] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.7);

  const [currentTime, setCurrentTime] = useState("0:00");
  const [duration, setDuration] = useState("0:00");

  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const [visualizerBars, setVisualizerBars] = useState<number[]>(
    new Array(24).fill(20)
  );

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";

    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);

    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    const updateProgress = () => {
      if (!audio.duration) return;

      setProgress((audio.currentTime / audio.duration) * 100);

      setCurrentTime(formatTime(audio.currentTime));
      setDuration(formatTime(audio.duration));
    };

    const ended = () => {
      if (repeat && currentTrack) {
        playTrack(currentTrack);
        return;
      }

      if (queue.length > 0) {
        const next = queue[0];

        setQueue((prev) => prev.slice(1));

        playTrack(next);
        return;
      }

      nextTrack();
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("ended", ended);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("ended", ended);
    };
  }, [currentTrack, repeat, queue]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isPlaying) {
      interval = setInterval(() => {
        setVisualizerBars(
          new Array(24)
            .fill(0)
            .map(() => Math.floor(Math.random() * 100) + 10)
        );
      }, 120);
    } else {
      setVisualizerBars(new Array(24).fill(20));
    }

    return () => clearInterval(interval);
  }, [isPlaying]);

  const uploadTrack = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;

    if (!files) return;

    const newTracks: Track[] = Array.from(files).map(
      (file, index) => ({
        id: `${file.name}-${Date.now()}-${index}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Uploaded Media",
        url: URL.createObjectURL(file),
        image:
          "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1200",
        likes: 0,
        plays: 0,
        addedAt: Date.now(),
      })
    );

    setTracks((prev) => [...newTracks, ...prev]);
  };

  const playTrack = async (track: Track) => {
    if (!audioRef.current) return;

    try {
      audioRef.current.src = track.url;

      audioRef.current.volume = volume;

      await audioRef.current.play();

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

      setRecentlyPlayed((prev) => {
        const filtered = prev.filter(
          (t) => t.id !== track.id
        );

        return [track, ...filtered].slice(0, 5);
      });
    } catch (err) {
      console.log(err);
    }
  };

  const pauseTrack = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const resumeTrack = async () => {
    if (!audioRef.current || !currentTrack) return;

    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      console.log(err);
    }
  };

  const nextTrack = () => {
    if (tracks.length === 0) return;

    let next: Track;

    if (shuffle) {
      next =
        tracks[
          Math.floor(Math.random() * tracks.length)
        ];
    } else {
      const currentIndex = tracks.findIndex(
        (t) => t.id === currentTrack?.id
      );

      next =
        tracks[
          (currentIndex + 1) % tracks.length
        ];
    }

    playTrack(next);
  };

  const prevTrack = () => {
    if (tracks.length === 0) return;

    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack?.id
    );

    const prevIndex =
      (currentIndex - 1 + tracks.length) %
      tracks.length;

    playTrack(tracks[prevIndex]);
  };

  const seekTrack = (value: number) => {
    if (!audioRef.current) return;

    audioRef.current.currentTime =
      (value / 100) * audioRef.current.duration;
  };

  const likeTrack = (track: Track) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === track.id
          ? {
              ...t,
              likes: t.likes + 1,
            }
          : t
      )
    );
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => {
      const exists = prev.some(
        (t) => t.id === track.id
      );

      if (exists) return prev;

      return [...prev, track];
    });
  };

  const removeTrack = (track: Track) => {
    setTracks((prev) =>
      prev.filter((t) => t.id !== track.id)
    );

    setQueue((prev) =>
      prev.filter((t) => t.id !== track.id)
    );

    if (currentTrack?.id === track.id) {
      pauseTrack();
      setCurrentTrack(null);
    }
  };

  const filteredTracks = useMemo(() => {
    return tracks.filter((track) =>
      track.title
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [tracks, search]);

  const totalLikes = tracks.reduce(
    (sum, t) => sum + t.likes,
    0
  );

  const totalPlays = tracks.reduce(
    (sum, t) => sum + t.plays,
    0
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(to bottom, #0018a8, #000b5c)",
        color: "white",
        fontFamily: "Arial",
        padding: "20px",
      }}
    >
      <audio ref={audioRef} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontSize: "64px",
            margin: 0,
            fontWeight: "bold",
          }}
        >
          Z Music V37
        </h1>

        <label
          style={{
            background: "#91ff38",
            color: "#000",
            padding: "18px 28px",
            borderRadius: "18px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "20px",
            boxShadow: "0 0 24px #91ff38",
          }}
        >
          ⬆ Upload Media

          <input
            type="file"
            hidden
            multiple
            accept="audio/*"
            onChange={uploadTrack}
          />
        </label>
      </div>

      <input
        placeholder="Search music..."
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
        style={{
          width: "100%",
          padding: "18px",
          borderRadius: "20px",
          border: "2px solid #00d9ff",
          background: "#0016aa",
          color: "white",
          fontSize: "22px",
          outline: "none",
          marginBottom: "26px",
          boxShadow: "0 0 18px #00d9ff",
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "280px minmax(0, 1fr)",
          gap: "24px",
        }}
      >
        <div>
          <SidebarCard title="Library">
            🎵 {tracks.length} Tracks
            <br />
            ❤️ {totalLikes} Likes
            <br />
            🔥 {totalPlays} Plays
          </SidebarCard>

          <SidebarCard title="Queue">
            {queue.length === 0
              ? "No Tracks Queued"
              : queue.map((track) => (
                  <div
                    key={`queue-${track.id}`}
                    style={{
                      marginBottom: "12px",
                    }}
                  >
                    🎵 {track.title}
                  </div>
                ))}
          </SidebarCard>

          <SidebarCard title="Recently Played">
            {recentlyPlayed.length === 0
              ? "No Recent Tracks"
              : recentlyPlayed.map((track) => (
                  <div
                    key={`recent-${track.id}`}
                    style={{
                      marginBottom: "12px",
                    }}
                  >
                    🎵 {track.title}
                  </div>
                ))}
          </SidebarCard>
        </div>

        <div>
          {filteredTracks.map((track) => (
            <div
              key={track.id}
              style={{
                background: "#001ecf",
                borderRadius: "30px",
                overflow: "hidden",
                border: "2px solid #00d9ff",
                boxShadow:
                  "0 0 24px rgba(0,217,255,0.8)",
                marginBottom: "30px",
              }}
            >
              <img
                src={track.image}
                alt=""
                style={{
                  width: "100%",
                  height: "300px",
                  objectFit: "cover",
                }}
              />

              <div
                style={{
                  padding: "30px",
                }}
              >
                <h2
                  style={{
                    fontSize: "52px",
                    marginBottom: "20px",
                  }}
                >
                  {track.title}
                </h2>

                <div
                  style={{
                    fontSize: "24px",
                    marginBottom: "24px",
                  }}
                >
                  🔥 {track.plays} ❤️{" "}
                  {track.likes} 🎵 {track.artist}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "14px",
                  }}
                >
                  <ActionButton
                    color="#00d9ff"
                    onClick={() =>
                      playTrack(track)
                    }
                  >
                    ▶ Play
                  </ActionButton>

                  <ActionButton
                    color="#91ff38"
                    onClick={pauseTrack}
                  >
                    ❚❚ Pause
                  </ActionButton>

                  <ActionButton
                    color="#ff2ea6"
                    onClick={() =>
                      likeTrack(track)
                    }
                  >
                    ❤️ Like
                  </ActionButton>

                  <ActionButton
                    color="#ffcc00"
                    onClick={() =>
                      addToQueue(track)
                    }
                  >
                    ➕ Queue
                  </ActionButton>

                  <ActionButton
                    color="#ff6b81"
                    onClick={() =>
                      removeTrack(track)
                    }
                  >
                    🗑 Delete
                  </ActionButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          width: "760px",
          maxWidth: "92%",
          margin: "40px auto",
          background: "#000",
          borderRadius: "30px",
          border: "2px solid #00d9ff",
          padding: "28px",
          boxShadow: "0 0 26px #00d9ff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "22px",
            marginBottom: "20px",
            fontWeight: "bold",
          }}
        >
          <span>
            {currentTrack
              ? currentTrack.title
              : "No Track Playing"}
          </span>

          <span>
            {currentTime} / {duration}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "4px",
            height: "90px",
            marginBottom: "22px",
          }}
        >
          {visualizerBars.map((bar, index) => (
            <div
              key={index}
              style={{
                flex: 1,
                height: `${bar}%`,
                background:
                  "linear-gradient(to top, #00d9ff, #91ff38)",
                borderRadius: "8px",
                transition: "0.1s",
              }}
            />
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={(e) =>
            seekTrack(Number(e.target.value))
          }
          style={{
            width: "100%",
            marginBottom: "24px",
            accentColor: "#00d9ff",
          }}
        />

        <div
          style={{
            display: "flex",
            gap: "14px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <ActionButton
            color="#00d9ff"
            onClick={prevTrack}
          >
            ⏮
          </ActionButton>

          {isPlaying ? (
            <ActionButton
              color="#91ff38"
              onClick={pauseTrack}
            >
              ❚❚
            </ActionButton>
          ) : (
            <ActionButton
              color="#91ff38"
              onClick={resumeTrack}
            >
              ▶
            </ActionButton>
          )}

          <ActionButton
            color="#00d9ff"
            onClick={nextTrack}
          >
            ⏭
          </ActionButton>

          <ActionButton
            color={
              shuffle ? "#ffcc00" : "#555"
            }
            onClick={() =>
              setShuffle(!shuffle)
            }
          >
            Shuffle
          </ActionButton>

          <ActionButton
            color={
              repeat ? "#ff2ea6" : "#555"
            }
            onClick={() =>
              setRepeat(!repeat)
            }
          >
            Repeat
          </ActionButton>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => {
              const value = Number(
                e.target.value
              );

              setVolume(value);

              if (audioRef.current) {
                audioRef.current.volume =
                  value;
              }
            }}
          />
        </div>
      </div>
    </main>
  );
}

function SidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#0016aa",
        borderRadius: "26px",
        border: "2px solid #00d9ff",
        padding: "20px",
        marginBottom: "20px",
        boxShadow: "0 0 20px #00d9ff",
      }}
    >
      <h2
        style={{
          fontSize: "26px",
          marginBottom: "18px",
        }}
      >
        {title}
      </h2>

      <div
        style={{
          lineHeight: "2",
          fontSize: "18px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  color,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color,
        color: "#000",
        border: "none",
        borderRadius: "18px",
        padding: "16px 24px",
        fontWeight: "bold",
        fontSize: "22px",
        cursor: "pointer",
        boxShadow: `0 0 16px ${color}`,
      }}
    >
      {children}
    </button>
  );
}
