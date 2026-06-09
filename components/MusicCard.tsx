"use client";

/* eslint-disable @next/next/no-img-element */

type Track = {
  id: number;
  artist: string;
  title: string;
  producer: string;
  genre: string;
  cover: string;
  audio: string;
  likes: number;
};

type Props = {
  track: Track;
  darkMode: boolean;
  playTrack: (track: Track) => void;
  deleteTrack: (id: number) => void;
  likeTrack: (id: number) => void;
};

export default function MusicCard({
  track,
  darkMode,
  playTrack,
  deleteTrack,
  likeTrack,
}: Props) {
  const cardStyle = {
    background: darkMode
      ? "rgba(0,0,40,0.95)"
      : "rgba(255,255,255,0.95)",
    border: "2px solid #00d9ff",
    borderRadius: 24,
    padding: 25,
    marginBottom: 25,
    boxShadow: "0 0 20px rgba(0,217,255,0.3)",
    transition: "0.3s",
  };

  const buttonStyle = {
    padding: "12px 20px",
    borderRadius: 14,
    border: "none",
    cursor: "pointer",
    fontWeight: "bold" as const,
    marginRight: 12,
    fontSize: 15,
  };

  return (
    <div style={cardStyle}>
      <img
        src={track.cover}
        alt={track.title}
        style={{
          width: "100%",
          height: 260,
          objectFit: "cover",
          borderRadius: 18,
          marginBottom: 20,
          border: "2px solid cyan",
        }}
      />

      <h2
        style={{
          fontSize: 30,
          fontWeight: "bold",
          color: darkMode ? "white" : "black",
          marginBottom: 10,
        }}
      >
        {track.title}
      </h2>

      <p
        style={{
          color: darkMode ? "#cbd5e1" : "#333",
          fontSize: 18,
          marginBottom: 6,
        }}
      >
        🎤 {track.artist}
      </p>

      <p
        style={{
          color: darkMode ? "#94a3b8" : "#555",
          marginBottom: 6,
        }}
      >
        🎹 Producer: {track.producer}
      </p>

      <p
        style={{
          color: darkMode ? "#94a3b8" : "#555",
          marginBottom: 20,
        }}
      >
        🎼 Genre: {track.genre}
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          onClick={() => playTrack(track)}
          style={{
            ...buttonStyle,
            background: "#00d9ff",
            color: "black",
          }}
        >
          ▶ Play
        </button>

        <button
          onClick={() => likeTrack(track.id)}
          style={{
            ...buttonStyle,
            background: "#ff2e88",
            color: "white",
          }}
        >
          ❤️ {track.likes}
        </button>

        <button
          onClick={() => deleteTrack(track.id)}
          style={{
            ...buttonStyle,
            background: "#ff3b30",
            color: "white",
          }}
        >
          🗑 Delete
        </button>
      </div>
    </div>
  );
}
