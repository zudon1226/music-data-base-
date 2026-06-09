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
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [volume, setVolume] = useState(1);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const [queue, setQueue] = useState<Track[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const savedTracks = localStorage.getItem("zmusic-tracks");
    const savedQueue = localStorage.getItem("zmusic-queue");
    const savedRecent = localStorage.getItem("zmusic-recent");

    if (savedTracks) setTracks(JSON.parse(savedTracks));
    if (savedQueue) setQueue(JSON.parse(savedQueue));
    if (savedRecent) setRecentlyPlayed(JSON.parse(savedRecent));
  }, []);

  useEffect(() => {
    localStorage.setItem("zmusic-tracks", JSON.stringify(tracks));
  }, [tracks]);

  useEffect(() => {
    localStorage.setItem("zmusic-queue", JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem(
      "zmusic-recent",
      JSON.stringify(recentlyPlayed)
    );
  }, [recentlyPlayed]);

  useEffect(() => {
    if (!audioRef.current) return;

    audioRef.current.volume = volume;

    const update = () => {
      if (!audioRef.current) return;

      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    };

    const ended = () => {
      if (repeat && currentTrack) {
        playTrack(currentTrack);
        return;
      }

      playNext();
    };

    audioRef.current.addEventListener("timeupdate", update);
    audioRef.current.addEventListener("ended", ended);

    return () => {
      audioRef.current?.removeEventListener(
        "timeupdate",
        update
      );
      audioRef.current?.removeEventListener("ended", ended);
    };
  }, [repeat, currentTrack]);

  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return "0:00";

    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);

    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const uploadTracks = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files) return;

    const newTracks: Track[] = Array.from(files).map(
      (file, index) => ({
        id: `${Date.now()}-${index}-${Math.random()}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Uploaded Media",
        url: URL.createObjectURL(file),
        image:
          "https://images.unsplash.com/photo-1511379938547-c1f69419868d",
        likes: 0,
        plays: 0,
      })
    );

    setTracks((prev) => [...prev, ...newTracks]);
  };

  const playTrack = async (track: Track) => {
    if (!audioRef.current) return;

    try {
      audioRef.current.src = track.url;
      await audioRef.current.play();

      setCurrentTrack(track);
      setIsPlaying(true);

      setTracks((prev) =>
        prev.map((t) =>
          t.id === track.id
            ? { ...t, plays: t.plays + 1 }
            : t
        )
      );

      setRecentlyPlayed((prev) => {
        const filtered = prev.filter(
          (t) => t.id !== track.id
        );

        return [track, ...filtered].slice(0, 10);
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
    try {
      await audioRef.current?.play();
      setIsPlaying(true);
    } catch (err) {
      console.log(err);
    }
  };

  const playNext = () => {
    if (!tracks.length) return;

    if (shuffle) {
      const random =
        tracks[Math.floor(Math.random() * tracks.length)];

      playTrack(random);
      return;
    }

    if (!currentTrack) {
      playTrack(tracks[0]);
      return;
    }

    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );

    const nextIndex =
      currentIndex + 1 >= tracks.length
        ? 0
        : currentIndex + 1;

    playTrack(tracks[nextIndex]);
  };

  const playPrev = () => {
    if (!tracks.length) return;

    if (!currentTrack) {
      playTrack(tracks[0]);
      return;
    }

    const currentIndex = tracks.findIndex(
      (t) => t.id === currentTrack.id
    );

    const prevIndex =
      currentIndex - 1 < 0
        ? tracks.length - 1
        : currentIndex - 1;

    playTrack(tracks[prevIndex]);
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => {
      if (prev.some((t) => t.id === track.id)) {
        return prev;
      }

      return [...prev, track];
    });
  };

  const likeTrack = (track: Track) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === track.id
          ? { ...t, likes: t.likes + 1 }
          : t
      )
    );
  };

  const deleteTrack = (track: Track) => {
    setTracks((prev) =>
      prev.filter((t) => t.id !== track.id)
    );

    setQueue((prev) =>
      prev.filter((t) => t.id !== track.id)
    );

    setRecentlyPlayed((prev) =>
      prev.filter((t) => t.id !== track.id)
    );

    if (currentTrack?.id === track.id) {
      pauseTrack();
      setCurrentTrack(null);
    }
  };

  const filteredTracks = tracks.filter((track) =>
    track.title
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0917a8",
        color: "white",
        padding: "20px",
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
        <h1 style={{ fontSize: "64px" }}>
          Z Music V38
        </h1>

        <label
          style={{
            background: "#9cff2e",
            color: "black",
            padding: "18px 26px",
            borderRadius: "18px",
            cursor: "pointer",
            fontWeight: "bold",
            boxShadow: "0 0 20px #9cff2e",
          }}
        >
          ⬆ Upload Media

          <input
            type="file"
            multiple
            accept="audio/*"
            onChange={uploadTracks}
            hidden
          />
        </label>
      </div>

      <input
        placeholder="Search music..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: "100%",
          padding: "22px",
          borderRadius: "20px",
          border: "2px solid #00d9ff",
          background: "#1321c7",
          color: "white",
          fontSize: "28px",
          marginBottom: "20px",
          boxShadow: "0 0 18px #00d9ff",
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
            <p>🎵 {tracks.length} Tracks</p>
            <p>
              ❤️{" "}
              {tracks.reduce(
                (a, b) => a + b.likes,
                0
              )}{" "}
              Likes
            </p>
            <p>
              🔥{" "}
              {tracks.reduce(
                (a, b) => a + b.plays,
                0
              )}{" "}
              Plays
            </p>
          </SidebarCard>

          <SidebarCard title="Queue">
            {queue.length === 0 && (
              <p>No Tracks Queued</p>
            )}

            {queue.map((track) => (
              <MiniTrack
                key={track.id}
                title={track.title}
              />
            ))}
          </SidebarCard>

          <SidebarCard title="Recently Played">
            {recentlyPlayed.length === 0 && (
              <p>No Recent Tracks</p>
            )}

            {recentlyPlayed.map((track) => (
              <MiniTrack
                key={track.id}
                title={track.title}
              />
            ))}
          </SidebarCard>
        </div>

        <div>
          {filteredTracks.map((track) => (
            <div
              key={track.id}
              style={{
                background: "#1321c7",
                borderRadius: "30px",
                overflow: "hidden",
                marginBottom: "24px",
                boxShadow: "0 0 25px #00d9ff",
              }}
            >
              <img
                src={track.image}
                style={{
                  width: "100%",
                  height: "300px",
                  objectFit: "cover",
                }}
              />

              <div style={{ padding: "28px" }}>
                <h2
                  style={{
                    fontSize: "42px",
                    marginBottom: "12px",
                  }}
                >
                  {track.title}
                </h2>

                <p style={{ fontSize: "28px" }}>
                  🔥 {track.plays}
                  {"  "} ❤️ {track.likes}
                  {"  "} 🎵 {track.artist}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: "16px",
                    flexWrap: "wrap",
                    marginTop: "20px",
                  }}
                >
                  <ActionButton
                    color="#00d9ff"
                    text="▶ Play"
                    onClick={() => playTrack(track)}
                  />

                  <ActionButton
                    color="#9cff2e"
                    text="⏸ Pause"
                    onClick={pauseTrack}
                  />

                  <ActionButton
                    color="#ff2ea6"
                    text="❤️ Like"
                    onClick={() => likeTrack(track)}
                  />

                  <ActionButton
                    color="#ffd000"
                    text="➕ Queue"
                    onClick={() => addToQueue(track)}
                  />

                  <ActionButton
                    color="#ff6f91"
                    text="🗑 Delete"
                    onClick={() => deleteTrack(track)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: "30px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "700px",
          maxWidth: "92%",
          background: "black",
          borderRadius: "30px",
          padding: "26px",
          boxShadow: "0 0 30px #00d9ff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "18px",
            fontWeight: "bold",
            fontSize: "28px",
          }}
        >
          <span>
            {currentTrack
              ? currentTrack.title
              : "No Track Playing"}
          </span>

          <span>
            {formatTime(currentTime)} /{" "}
            {formatTime(duration)}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "8px",
            height: "90px",
            marginBottom: "20px",
          }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: "18px",
                height: isPlaying
                  ? `${30 + Math.random() * 50}px`
                  : "18px",
                background:
                  "linear-gradient(#9cff2e,#00d9ff)",
                borderRadius: "10px",
                transition: "0.2s",
              }}
            />
          ))}
        </div>

        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={(e) => {
            if (!audioRef.current) return;

            audioRef.current.currentTime =
              Number(e.target.value);

            setCurrentTime(Number(e.target.value));
          }}
          style={{
            width: "100%",
            marginBottom: "24px",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "12px",
            }}
          >
            <PlayerButton
              color="#00d9ff"
              text="⏮"
              onClick={playPrev}
            />

            {!isPlaying ? (
              <PlayerButton
                color="#9cff2e"
                text="▶"
                onClick={resumeTrack}
              />
            ) : (
              <PlayerButton
                color="#9cff2e"
                text="⏸"
                onClick={pauseTrack}
              />
            )}

            <PlayerButton
              color="#00d9ff"
              text="⏭"
              onClick={playNext}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
            }}
          >
            <PlayerButton
              color={shuffle ? "#ffd000" : "#555"}
              text="Shuffle"
              onClick={() =>
                setShuffle(!shuffle)
              }
            />

            <PlayerButton
              color={repeat ? "#ff2ea6" : "#555"}
              text="Repeat"
              onClick={() =>
                setRepeat(!repeat)
              }
            />
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) =>
              setVolume(Number(e.target.value))
            }
            style={{
              width: "120px",
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
        background: "#1321c7",
        borderRadius: "26px",
        padding: "20px",
        marginBottom: "20px",
        boxShadow: "0 0 22px #00d9ff",
      }}
    >
      <h2
        style={{
          marginBottom: "18px",
          fontSize: "24px",
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  );
}

function MiniTrack({
  title,
}: {
  title: string;
}) {
  return (
    <div
      style={{
        background: "#1b2be6",
        padding: "12px",
        borderRadius: "14px",
        marginBottom: "10px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      🎵 {title}
    </div>
  );
}

function ActionButton({
  color,
  text,
  onClick,
}: {
  color: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color,
        color: "black",
        border: "none",
        padding: "16px 24px",
        borderRadius: "18px",
        fontWeight: "bold",
        fontSize: "22px",
        cursor: "pointer",
        boxShadow: `0 0 18px ${color}`,
      }}
    >
      {text}
    </button>
  );
}

function PlayerButton({
  color,
  text,
  onClick,
}: {
  color: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: color,
        color: "black",
        border: "none",
        padding: "14px 20px",
        borderRadius: "18px",
        fontWeight: "bold",
        fontSize: "24px",
        cursor: "pointer",
        boxShadow: `0 0 18px ${color}`,
      }}
    >
      {text}
    </button>
  );
}
