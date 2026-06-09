"use client";

import { useEffect, useRef, useState } from "react";

type Track = {
  id: number;
  artist: string;
  title: string;
  producer: string;
  genre: string;
  cover: string;
  audio: string;
  plays: number;
  likes: number;
};

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [search, setSearch] = useState("");
  const [darkMode, setDarkMode] = useState(true);

  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [producer, setProducer] = useState("");
  const [genre, setGenre] = useState("");
  const [cover, setCover] = useState("");

  const [audioFile, setAudioFile] = useState<File | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredTracks = tracks.filter(
    (track) =>
      track.artist.toLowerCase().includes(search.toLowerCase()) ||
      track.title.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    const updateProgress = () => {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };

    audio.addEventListener("timeupdate", updateProgress);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
    };
  }, []);

  const uploadTrack = () => {
    if (!audioFile) return;

    const audioURL = URL.createObjectURL(audioFile);

    const newTrack: Track = {
      id: Date.now(),
      artist,
      title,
      producer,
      genre,
      cover:
        cover ||
        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a",
      audio: audioURL,
      plays: 0,
      likes: 0,
    };

    setTracks([newTrack, ...tracks]);

    setArtist("");
    setTitle("");
    setProducer("");
    setGenre("");
    setCover("");
    setAudioFile(null);
  };

  const playTrack = (track: Track) => {
    if (!audioRef.current) return;

    audioRef.current.src = track.audio;
    audioRef.current.play();

    setCurrentTrack(track);
    setPlaying(true);

    setTracks((prev) =>
      prev.map((t) =>
        t.id === track.id ? { ...t, plays: t.plays + 1 } : t
      )
    );
  };

  const pauseTrack = () => {
    audioRef.current?.pause();
    setPlaying(false);
  };

  const deleteTrack = (id: number) => {
    setTracks(tracks.filter((track) => track.id !== id));
  };

  const likeTrack = (id: number) => {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === id
          ? { ...track, likes: track.likes + 1 }
          : track
      )
    );
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: darkMode
          ? "linear-gradient(135deg,#001a4d,#00bfff)"
          : "#f5f5f5",
        color: "white",
        fontFamily: "Arial",
      }}
    >
      <style>{`
        @keyframes pulse {
          from {
            transform: scaleY(0.7);
            opacity: 0.5;
          }
          to {
            transform: scaleY(1.2);
            opacity: 1;
          }
        }
      `}</style>

      {/* SIDEBAR */}

      <div
        style={{
          width: 220,
          background: "#000c2e",
          padding: 20,
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          overflowY: "auto",
          zIndex: 100,
        }}
      >
        <h1
          style={{
            fontSize: 64,
            marginBottom: 30,
            lineHeight: 1,
          }}
        >
          Z Music V21
        </h1>

        <button
          onClick={() => setDarkMode(!darkMode)}
          style={sideButton}
        >
          Toggle Theme
        </button>

        <button style={greenButton}>Start Recording</button>

        <div
          style={{
            marginTop: 20,
            padding: 15,
            borderRadius: 14,
            background: "#002b2b",
          }}
        >
          🟢 READY
          <br />
          ⏱ 0s
        </div>

        <div style={{ marginTop: 30 }}>
          <p>🎵 Tracks: {tracks.length}</p>
          <p>❤️ Likes: {tracks.reduce((a, b) => a + b.likes, 0)}</p>
          <p>🔥 Plays: {tracks.reduce((a, b) => a + b.plays, 0)}</p>
        </div>
      </div>

      {/* MAIN */}

      <div
        style={{
          flex: 1,
          marginLeft: 220,
          padding: "30px 30px 140px",
        }}
      >
        {/* HEADER */}

        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            backdropFilter: "blur(12px)",
            background: "rgba(0,0,0,0.15)",
            borderRadius: 20,
            padding: 10,
          }}
        >
          <div
            style={{
              background:
                "linear-gradient(90deg,#ffe600,#ff9d5c,#ff5cb8)",
              padding: 18,
              borderRadius: 20,
              color: "black",
              fontWeight: "bold",
              marginBottom: 20,
            }}
          >
            SPONSOR AD — V21 Creator Platform
          </div>

          <h1 style={{ fontSize: 64 }}>
            Music Business Platform V21
          </h1>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search music..."
            style={searchStyle}
          />
        </div>

        {/* UPLOAD */}

        <div style={uploadBox}>
          <h2 style={{ fontSize: 40 }}>Upload MP3</h2>

          <input
            placeholder="Artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            style={inputStyle}
          />

          <input
            placeholder="Song Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
          />

          <input
            placeholder="Producer"
            value={producer}
            onChange={(e) => setProducer(e.target.value)}
            style={inputStyle}
          />

          <input
            placeholder="Genre"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            style={inputStyle}
          />

          <input
            placeholder="Cover URL"
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            style={inputStyle}
          />

          <input
            type="file"
            accept="audio/*"
            onChange={(e) =>
              setAudioFile(e.target.files?.[0] || null)
            }
            style={{ marginTop: 20 }}
          />

          <button
            onClick={uploadTrack}
            style={{
              ...greenButton,
              marginTop: 20,
            }}
          >
            Upload Track
          </button>
        </div>

        {/* TRACKS */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(400px,1fr))",
            gap: 30,
            marginTop: 40,
          }}
        >
          {filteredTracks.map((track) => (
            <div
              key={track.id}
              style={{
                background:
                  "linear-gradient(135deg,#001a4d,#003366)",
                borderRadius: 30,
                overflow: "hidden",
                transition: "0.3s",
                boxShadow:
                  "0 0 25px rgba(0,229,255,0.2)",
              }}
            >
              <img
                src={track.cover}
                alt=""
                style={{
                  width: "100%",
                  height: 300,
                  objectFit: "cover",
                }}
              />

              <div style={{ padding: 25 }}>
                <h1 style={{ fontSize: 52 }}>
                  {track.artist}
                </h1>

                <div
                  style={{
                    display: "inline-block",
                    background: "#ff0055",
                    color: "white",
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: "bold",
                    marginBottom: 12,
                  }}
                >
                  ● LIVE
                </div>

                <h2>{track.title}</h2>

                <p>Producer: {track.producer}</p>
                <p>Genre: {track.genre}</p>
                <p>Plays: {track.plays}</p>
                <p>Likes: {track.likes}</p>

                {/* VISUALIZER */}

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "end",
                    height: 40,
                    marginTop: 20,
                    marginBottom: 20,
                  }}
                >
                  {[20, 35, 15, 40, 25, 45, 18].map(
                    (h, i) => (
                      <div
                        key={i}
                        style={{
                          width: 8,
                          height: h,
                          borderRadius: 20,
                          background:
                            "linear-gradient(180deg,#00e5ff,#ffe600)",
                          animation:
                            "pulse 1s infinite alternate",
                        }}
                      />
                    )
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    style={blueButton}
                    onClick={() => playTrack(track)}
                  >
                    Play
                  </button>

                  <button
                    style={whiteButton}
                    onClick={pauseTrack}
                  >
                    Pause
                  </button>

                  <button
                    style={yellowButton}
                    onClick={() => likeTrack(track.id)}
                  >
                    Like
                  </button>

                  <button
                    style={pinkButton}
                    onClick={() => deleteTrack(track.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PLAYER */}

      <div
        style={{
          position: "fixed",
          left: 220,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,30,0.95)",
          padding: "16px 24px",
          backdropFilter: "blur(12px)",
          borderTop: "2px solid #00e5ff",
          zIndex: 999,
        }}
      >
        <audio ref={audioRef} />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div style={{ minWidth: 140 }}>
            <div style={{ fontWeight: "bold" }}>
              Now Playing
            </div>

            <div>
              {currentTrack
                ? `${currentTrack.artist} - ${currentTrack.title}`
                : "No media playing"}
            </div>
          </div>

          <button
            style={blueButton}
            onClick={() =>
              currentTrack && playTrack(currentTrack)
            }
          >
            Play
          </button>

          <button
            style={whiteButton}
            onClick={pauseTrack}
          >
            Pause
          </button>

          <div
            style={{
              flex: 1,
              height: 14,
              borderRadius: 20,
              background: "#333",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${
                  duration
                    ? (progress / duration) * 100
                    : 0
                }%`,
                height: "100%",
                background:
                  "linear-gradient(90deg,#00e5ff,#ffe600)",
              }}
            />
          </div>

          <div>
            {Math.floor(progress)} /{" "}
            {Math.floor(duration)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* STYLES */

const sideButton = {
  width: "100%",
  padding: 18,
  marginBottom: 14,
  borderRadius: 16,
  border: "none",
  background: "#8ce3e3",
  fontWeight: "bold",
  cursor: "pointer",
};

const greenButton = {
  width: "100%",
  padding: 18,
  marginTop: 10,
  borderRadius: 16,
  border: "none",
  background: "#8cff5f",
  fontWeight: "bold",
  cursor: "pointer",
};

const blueButton = {
  padding: "12px 20px",
  borderRadius: 14,
  border: "none",
  background: "#00d9ff",
  fontWeight: "bold",
  cursor: "pointer",
};

const whiteButton = {
  padding: "12px 20px",
  borderRadius: 14,
  border: "none",
  background: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const yellowButton = {
  padding: "12px 20px",
  borderRadius: 14,
  border: "none",
  background: "#ffe600",
  fontWeight: "bold",
  cursor: "pointer",
};

const pinkButton = {
  padding: "12px 20px",
  borderRadius: 14,
  border: "none",
  background: "#ff6eb4",
  fontWeight: "bold",
  cursor: "pointer",
};

const searchStyle = {
  width: "100%",
  padding: 22,
  borderRadius: 20,
  border: "2px solid #00d9ff",
  background: "#00114d",
  color: "white",
  fontSize: 22,
  marginTop: 20,
};

const inputStyle = {
  width: "100%",
  padding: 20,
  borderRadius: 18,
  border: "2px solid #00d9ff",
  background: "#00114d",
  color: "white",
  fontSize: 20,
  marginTop: 18,
};

const uploadBox = {
  border: "3px dashed #00d9ff",
  borderRadius: 30,
  padding: 30,
  marginTop: 40,
  background: "rgba(0,0,0,0.15)",
};
