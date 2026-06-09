"use client";

import { useEffect, useRef, useState } from "react";

import {
  FaPlay,
  FaPause,
  FaStepBackward,
  FaStepForward,
  FaUpload,
  FaTrash,
  FaHeart,
  FaPlus,
  FaVolumeUp,
  FaMusic,
} from "react-icons/fa";

type Track = {
  id: number;
  title: string;
  artist: string;
  cover: string;
  audio?: string;
  video?: string;
  genre: string;
  bpm: number;
  likes: number;
  plays: number;
  duration?: string;
};

export default function ZMusicV33() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);

  const [currentTrack, setCurrentTrack] =
    useState<Track | null>(null);

  const [playing, setPlaying] = useState(false);

  const [progress, setProgress] = useState(0);

  const [currentTime, setCurrentTime] =
    useState("0:00");

  const [duration, setDuration] =
    useState("0:00");

  const [volume, setVolume] = useState(0.7);

  const [queue, setQueue] = useState<Track[]>([]);

  const [recentlyPlayed, setRecentlyPlayed] =
    useState<Track[]>([]);

  const [search, setSearch] = useState("");

  const [shuffle, setShuffle] = useState(false);

  const [repeat, setRepeat] = useState(false);

  const [currentIndex, setCurrentIndex] =
    useState(0);

  useEffect(() => {
    const savedTracks = localStorage.getItem(
      "zmusic_tracks_v33"
    );

    if (savedTracks) {
      setTracks(JSON.parse(savedTracks));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "zmusic_tracks_v33",
      JSON.stringify(tracks)
    );
  }, [tracks]);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    audio.volume = volume;

    const updateProgress = () => {
      if (!audio.duration) return;

      setProgress(
        (audio.currentTime / audio.duration) * 100
      );

      setCurrentTime(formatTime(audio.currentTime));

      setDuration(formatTime(audio.duration));
    };

    const ended = () => {
      if (repeat && currentTrack) {
        audio.currentTime = 0;
        audio.play();
        return;
      }

      nextTrack();
    };

    audio.addEventListener(
      "timeupdate",
      updateProgress
    );

    audio.addEventListener("ended", ended);

    return () => {
      audio.removeEventListener(
        "timeupdate",
        updateProgress
      );

      audio.removeEventListener("ended", ended);
    };
  }, [currentTrack, repeat, volume]);

  const playTrack = async (
    track: Track,
    index: number
  ) => {
    if (!audioRef.current || !track.audio) return;

    try {
      audioRef.current.src = track.audio;

      await audioRef.current.play();

      setCurrentTrack(track);

      setCurrentIndex(index);

      setPlaying(true);

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
          (p) => p.id !== track.id
        );

        return [track, ...filtered].slice(0, 5);
      });
    } catch (err) {
      console.log(err);
    }
  };

  const pauseTrack = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  const resumeTrack = async () => {
    try {
      await audioRef.current?.play();
      setPlaying(true);
    } catch (err) {
      console.log(err);
    }
  };

  const nextTrack = () => {
    if (!tracks.length) return;

    let next;

    if (shuffle) {
      next = Math.floor(Math.random() * tracks.length);
    } else {
      next =
        currentIndex + 1 >= tracks.length
          ? 0
          : currentIndex + 1;
    }

    playTrack(tracks[next], next);
  };

  const previousTrack = () => {
    if (!tracks.length) return;

    let prev =
      currentIndex - 1 < 0
        ? tracks.length - 1
        : currentIndex - 1;

    playTrack(tracks[prev], prev);
  };

  const uploadMedia = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;

    if (!files) return;

    const uploaded: Track[] = [];

    Array.from(files).forEach((file, i) => {
      const url = URL.createObjectURL(file);

      uploaded.push({
        id: Date.now() + i,

        title: file.name,

        artist: "Uploaded Media",

        cover:
          "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1600&auto=format&fit=crop",

        audio: file.type.startsWith("audio")
          ? url
          : undefined,

        video: file.type.startsWith("video")
          ? url
          : undefined,

        genre: "Uploaded",

        bpm: 120,

        likes: 0,

        plays: 0,
      });
    });

    setTracks((prev) => [...uploaded, ...prev]);
  };

  const deleteTrack = (id: number) => {
    setTracks((prev) =>
      prev.filter((t) => t.id !== id)
    );

    setQueue((prev) =>
      prev.filter((t) => t.id !== id)
    );
  };

  const likeTrack = (id: number) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              likes: t.likes + 1,
            }
          : t
      )
    );
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => [...prev, track]);
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
        background:
          "linear-gradient(to bottom, #0018a8, #000814)",
        color: "white",
        fontFamily: "Arial",
        padding: 20,
      }}
    >
      <audio ref={audioRef} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 30,
        }}
      >
        <h1
          style={{
            fontSize: 70,
            fontWeight: "bold",
          }}
        >
          Z Music V33
        </h1>

        <label style={uploadBtn()}>
          <FaUpload /> Upload Media

          <input
            hidden
            multiple
            type="file"
            accept="audio/*,video/*"
            onChange={uploadMedia}
          />
        </label>
      </div>

      <input
        value={search}
        onChange={(e) =>
          setSearch(e.target.value)
        }
        placeholder="Search music..."
        style={{
          width: "100%",
          padding: 22,
          borderRadius: 20,
          border: "2px solid #00d9ff",
          background: "#00118f",
          color: "white",
          fontSize: 24,
          marginBottom: 35,
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "300px 1fr",
          gap: 25,
        }}
      >
        <div>
          <Panel title="Library">
            <SidebarItem
              label={`🎵 ${tracks.length} Tracks`}
            />

            <SidebarItem
              label={`❤️ ${tracks.reduce(
                (a, b) => a + b.likes,
                0
              )} Likes`}
            />

            <SidebarItem
              label={`🔥 ${tracks.reduce(
                (a, b) => a + b.plays,
                0
              )} Plays`}
            />
          </Panel>

          <Panel title="Queue">
            {queue.length === 0 && (
              <div>No Tracks Queued</div>
            )}

            {queue.map((track) => (
              <SidebarItem
                key={track.id}
                label={track.title}
              />
            ))}
          </Panel>

          <Panel title="Recently Played">
            {recentlyPlayed.length === 0 && (
              <div>No Recent Tracks</div>
            )}

            {recentlyPlayed.map((track) => (
              <SidebarItem
                key={track.id}
                label={track.title}
              />
            ))}
          </Panel>
        </div>

        <div>
          {filteredTracks.map(
            (track, index) => (
              <div
                key={track.id}
                style={{
                  background: "#0822a7",
                  borderRadius: 25,
                  overflow: "hidden",
                  marginBottom: 35,
                  border:
                    currentTrack?.id ===
                    track.id
                      ? "3px solid #00e1ff"
                      : "2px solid #00cfff",

                  boxShadow:
                    currentTrack?.id ===
                    track.id
                      ? "0 0 30px #00e1ff"
                      : "0 0 15px #00cfff",
                }}
              >
                <img
                  src={track.cover}
                  style={{
                    width: "100%",
                    height: 320,
                    objectFit: "cover",
                  }}
                />

                <div
                  style={{
                    padding: 30,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 60,
                    }}
                  >
                    {track.title}
                  </h2>

                  <h3
                    style={{
                      opacity: 0.8,
                      marginBottom: 20,
                    }}
                  >
                    {track.artist}
                  </h3>

                  <div
                    style={{
                      display: "flex",
                      gap: 20,
                      flexWrap: "wrap",
                      marginBottom: 30,
                      fontSize: 22,
                    }}
                  >
                    <span>
                      🔥 {track.plays}
                    </span>

                    <span>
                      ❤️ {track.likes}
                    </span>

                    <span>
                      🎵 {track.genre}
                    </span>

                    <span>
                      ⚡ {track.bpm} BPM
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 15,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      style={btn("#00d9ff")}
                      onClick={() =>
                        playTrack(
                          track,
                          index
                        )
                      }
                    >
                      <FaPlay /> Play
                    </button>

                    <button
                      style={btn("#7dff45")}
                      onClick={
                        pauseTrack
                      }
                    >
                      <FaPause /> Pause
                    </button>

                    <button
                      style={btn("#ff2f92")}
                      onClick={() =>
                        likeTrack(
                          track.id
                        )
                      }
                    >
                      <FaHeart /> Like
                    </button>

                    <button
                      style={btn("#ffbe0b")}
                      onClick={() =>
                        addToQueue(
                          track
                        )
                      }
                    >
                      <FaPlus /> Queue
                    </button>

                    <button
                      style={btn("#ff5f87")}
                      onClick={() =>
                        deleteTrack(
                          track.id
                        )
                      }
                    >
                      <FaTrash /> Delete
                    </button>
                  </div>

                  {track.video && (
                    <video
                      src={track.video}
                      controls
                      style={{
                        width: "100%",
                        marginTop: 30,
                        borderRadius: 20,
                      }}
                    />
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "black",
          padding: 25,
          marginTop: 40,
          borderTop:
            "2px solid #00d9ff",
          boxShadow:
            "0 0 20px #00d9ff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent:
              "space-between",
            marginBottom: 15,
          }}
        >
          <h2
            style={{
              fontSize: 34,
            }}
          >
            {currentTrack?.title ||
              "No Track Playing"}
          </h2>

          <h2>
            {currentTime} / {duration}
          </h2>
        </div>

        <input
          type="range"
          value={progress}
          min="0"
          max="100"
          onChange={(e) => {
            if (!audioRef.current)
              return;

            const seek =
              (Number(
                e.target.value
              ) /
                100) *
              audioRef.current
                .duration;

            audioRef.current.currentTime =
              seek;

            setProgress(
              Number(
                e.target.value
              )
            );
          }}
          style={{
            width: "100%",
            marginBottom: 25,
          }}
        />

        <div
          style={{
            display: "flex",
            gap: 15,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            style={btn("#00d9ff")}
            onClick={previousTrack}
          >
            <FaStepBackward />
          </button>

          <button
            style={btn("#7dff45")}
            onClick={() =>
              playing
                ? pauseTrack()
                : resumeTrack()
            }
          >
            {playing ? (
              <FaPause />
            ) : (
              <FaPlay />
            )}
          </button>

          <button
            style={btn("#00d9ff")}
            onClick={nextTrack}
          >
            <FaStepForward />
          </button>

          <button
            style={btn(
              shuffle
                ? "#ffbe0b"
                : "#666"
            )}
            onClick={() =>
              setShuffle(
                !shuffle
              )
            }
          >
            Shuffle
          </button>

          <button
            style={btn(
              repeat
                ? "#ff2f92"
                : "#666"
            )}
            onClick={() =>
              setRepeat(
                !repeat
              )
            }
          >
            Repeat
          </button>

          <FaVolumeUp size={26} />

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) =>
              setVolume(
                Number(
                  e.target.value
                )
              )
            }
          />
        </div>
      </div>
    </main>
  );
}

function Panel({
  title,
  children,
}: any) {
  return (
    <div
      style={{
        background: "#03126b",
        border:
          "2px solid #00d9ff",
        borderRadius: 20,
        padding: 20,
        marginBottom: 25,
        boxShadow:
          "0 0 20px #00d9ff",
      }}
    >
      <h2
        style={{
          marginBottom: 20,
          fontSize: 30,
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  );
}

function SidebarItem({
  label,
}: any) {
  return (
    <div
      style={{
        background: "#0822a7",
        padding: 14,
        borderRadius: 14,
        marginBottom: 10,
      }}
    >
      <FaMusic /> {label}
    </div>
  );
}

function uploadBtn() {
  return {
    background: "#7dff45",
    color: "black",
    padding: "18px 28px",
    borderRadius: 18,
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow:
      "0 0 20px rgba(125,255,69,0.9)",
  } as React.CSSProperties;
}

function btn(color: string) {
  return {
    background: color,
    color: "black",
    border: "none",
    padding: "16px 26px",
    borderRadius: 14,
    fontWeight: "bold",
    fontSize: 20,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 10,
    boxShadow: `0 0 15px ${color}`,
  } as React.CSSProperties;
}
