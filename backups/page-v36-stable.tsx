"use client";

import { useEffect, useRef, useState } from "react";

type Track = {
  id: string;
  title: string;
  artist: string;
  url: string;
  image: string;
  likes: number;
  plays: number;
};

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [currentTime, setCurrentTime] = useState("0:00");
  const [duration, setDuration] = useState("0:00");
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);

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
      } else {
        nextTrack();
      }
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("ended", ended);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("ended", ended);
    };
  }, [currentTrack, repeat]);

  const uploadTrack = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;

    if (!files) return;

    const newTracks: Track[] = Array.from(files).map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      title: file.name,
      artist: "Uploaded Media",
      url: URL.createObjectURL(file),
      image:
        "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1200",
      likes: 0,
      plays: 0,
    }));

    setTracks((prev) => [...prev, ...newTracks]);
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
        const filtered = prev.filter((t) => t.id !== track.id);

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
    if (!audioRef.current) return;

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
      next = tracks[Math.floor(Math.random() * tracks.length)];
    } else {
      const currentIndex = tracks.findIndex(
        (t) => t.id === currentTrack?.id
      );

      next = tracks[(currentIndex + 1) % tracks.length];
    }

    playTrack(next);
  };

  const prevTrack = () => {
    if (tracks.length === 0) return;

    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack?.id
    );

    const prevIndex =
      (currentIndex - 1 + tracks.length) % tracks.length;

    playTrack(tracks[prevIndex]);
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => {
      const exists = prev.some((t) => t.id === track.id);

      if (exists) return prev;

      return [...prev, track];
    });
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

  const deleteTrack = (track: Track) => {
    setTracks((prev) => prev.filter((t) => t.id !== track.id));
    setQueue((prev) => prev.filter((t) => t.id !== track.id));

    if (currentTrack?.id === track.id) {
      pauseTrack();
      setCurrentTrack(null);
    }
  };

  const seekTrack = (value: number) => {
    if (!audioRef.current) return;

    audioRef.current.currentTime =
      (value / 100) * audioRef.current.duration;
  };

  const filteredTracks = tracks.filter((track) =>
    track.title.toLowerCase().includes(search.toLowerCase())
  );

  const totalLikes = tracks.reduce(
    (sum, track) => sum + track.likes,
    0
  );

  const totalPlays = tracks.reduce(
    (sum, track) => sum + track.plays,
    0
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#001a8c",
        padding: "20px",
        color: "white",
        fontFamily: "Arial",
      }}
    >
      <audio ref={audioRef} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1
          style={{
            fontSize: "60px",
            fontWeight: "bold",
          }}
        >
          Z Music V36
        </h1>

        <label
          style={{
            background: "#8cff32",
            color: "black",
            padding: "18px 30px",
            borderRadius: "18px",
            cursor: "pointer",
            fontWeight: "bold",
            boxShadow: "0 0 20px #8cff32",
          }}
        >
          ⬆ Upload Media
          <input
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={uploadTrack}
          />
        </label>
      </div>

      <input
        placeholder="Search music..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "18px",
          borderRadius: "20px",
          border: "2px solid #00d9ff",
          background: "#0016aa",
          color: "white",
          fontSize: "22px",
          marginBottom: "30px",
          boxShadow: "0 0 15px #00d9ff",
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: "20px",
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
                      marginBottom: "10px",
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
                      marginBottom: "10px",
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
                background: "#0020cc",
                border: "2px solid #00d9ff",
                borderRadius: "30px",
                overflow: "hidden",
                marginBottom: "30px",
                boxShadow: "0 0 20px #00d9ff",
              }}
            >
              <img
                src={track.image}
                alt=""
                style={{
                  width: "100%",
                  height: "280px",
                  objectFit: "cover",
                }}
              />

              <div style={{ padding: "30px" }}>
                <h2
                  style={{
                    fontSize: "56px",
                    marginBottom: "20px",
                  }}
                >
                  {track.title}
                </h2>

                <div
                  style={{
                    fontSize: "26px",
                    marginBottom: "20px",
                  }}
                >
                  🔥 {track.plays} ❤️ {track.likes} 🎵{" "}
                  {track.artist}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "14px",
                    flexWrap: "wrap",
                  }}
                >
                  <Button
                    color="#00d9ff"
                    onClick={() => playTrack(track)}
                  >
                    ▶ Play
                  </Button>

                  <Button
                    color="#8cff32"
                    onClick={pauseTrack}
                  >
                    ❚❚ Pause
                  </Button>

                  <Button
                    color="#ff2ea6"
                    onClick={() => likeTrack(track)}
                  >
                    ❤️ Like
                  </Button>

                  <Button
                    color="#ffcc00"
                    onClick={() => addToQueue(track)}
                  >
                    ➕ Queue
                  </Button>

                  <Button
                    color="#ff6b81"
                    onClick={() => deleteTrack(track)}
                  >
                    🗑 Delete
                  </Button>
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
          border: "2px solid #00d9ff",
          borderRadius: "30px",
          padding: "30px",
          boxShadow: "0 0 30px #00d9ff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "20px",
            fontSize: "22px",
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
            accentColor: "#00d9ff",
            marginBottom: "24px",
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
          <Button color="#00d9ff" onClick={prevTrack}>
            ⏮
          </Button>

          {isPlaying ? (
            <Button
              color="#8cff32"
              onClick={pauseTrack}
            >
              ❚❚
            </Button>
          ) : (
            <Button
              color="#8cff32"
              onClick={resumeTrack}
            >
              ▶
            </Button>
          )}

          <Button color="#00d9ff" onClick={nextTrack}>
            ⏭
          </Button>

          <Button
            color={shuffle ? "#ffcc00" : "#555"}
            onClick={() => setShuffle(!shuffle)}
          >
            Shuffle
          </Button>

          <Button
            color={repeat ? "#ff2ea6" : "#555"}
            onClick={() => setRepeat(!repeat)}
          >
            Repeat
          </Button>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => {
              const value = Number(e.target.value);

              setVolume(value);

              if (audioRef.current) {
                audioRef.current.volume = value;
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
        border: "2px solid #00d9ff",
        borderRadius: "26px",
        padding: "20px",
        marginBottom: "20px",
        boxShadow: "0 0 20px #00d9ff",
      }}
    >
      <h2
        style={{
          fontSize: "26px",
          marginBottom: "16px",
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

function Button({
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
        color: "black",
        border: "none",
        borderRadius: "18px",
        padding: "16px 24px",
        fontWeight: "bold",
        fontSize: "22px",
        cursor: "pointer",
        boxShadow: `0 0 18px ${color}`,
      }}
    >
      {children}
    </button>
  );
}
