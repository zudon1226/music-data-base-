"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Track = {
  id: number
  artist: string
  title: string
  producer: string
  genre: string
  cover: string
  audio?: string
  likes: number
  plays: number
  verified: boolean
}

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [tracks, setTracks] = useState<Track[]>([])
  const [queue, setQueue] = useState<Track[]>([])
  const [playing, setPlaying] = useState<Track | null>(null)

  const [search, setSearch] = useState("")
  const [theme, setTheme] = useState("dark")
  const [showUpload, setShowUpload] = useState(false)

  const [recording, setRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)

  const [artist, setArtist] = useState("")
  const [title, setTitle] = useState("")
  const [producer, setProducer] = useState("")
  const [genre, setGenre] = useState("")
  const [cover, setCover] = useState("")

  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState("0:00")
  const [durationText, setDurationText] = useState("0:00")

  useEffect(() => {
    const saved = localStorage.getItem("v20_tracks")

    if (saved) {
      setTracks(JSON.parse(saved))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      "v20_tracks",
      JSON.stringify(tracks)
    )
  }, [tracks])

  useEffect(() => {
    let timer: any

    if (recording) {
      timer = setInterval(() => {
        setRecordTime((prev) => prev + 1)
      }, 1000)
    }

    return () => clearInterval(timer)
  }, [recording])

  const filteredTracks = useMemo(() => {
    return tracks.filter((track) =>
      `${track.artist} ${track.title} ${track.genre}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }, [tracks, search])

  function formatTime(time: number) {
    if (!time || Number.isNaN(time)) return "0:00"

    const min = Math.floor(time / 60)
    const sec = Math.floor(time % 60)
      .toString()
      .padStart(2, "0")

    return `${min}:${sec}`
  }

  function uploadTrack(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0]

    if (!file) return

    const url = URL.createObjectURL(file)

    const newTrack: Track = {
      id: Date.now(),
      artist: artist || "Unknown Artist",
      title: title || file.name,
      producer,
      genre,
      cover:
        cover ||
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1600&auto=format&fit=crop",
      audio: url,
      likes: 0,
      plays: 0,
      verified: false,
    }

    setTracks((prev) => [newTrack, ...prev])

    setArtist("")
    setTitle("")
    setProducer("")
    setGenre("")
    setCover("")
  }

  function playTrack(track: Track) {
    if (!track.audio || !audioRef.current) return

    audioRef.current.src = track.audio
    audioRef.current.play()

    setPlaying(track)

    setTracks((prev) =>
      prev.map((t) =>
        t.id === track.id
          ? { ...t, plays: t.plays + 1 }
          : t
      )
    )
  }

  function pauseTrack() {
    audioRef.current?.pause()
  }

  function addLike(id: number) {
    setTracks((prev) =>
      prev.map((track) =>
        track.id === id
          ? { ...track, likes: track.likes + 1 }
          : track
      )
    )
  }

  function deleteTrack(id: number) {
    setTracks((prev) =>
      prev.filter((track) => track.id !== id)
    )
  }

  const appStyle = {
    display: "flex",
    minHeight: "100vh",
    background:
      theme === "dark"
        ? "linear-gradient(135deg,#00154d,#00cfff)"
        : "linear-gradient(135deg,#f4f7ff,#d9ffff)",
    color: theme === "dark" ? "white" : "black",
    fontFamily: "Arial",
  } as const

  return (
    <div style={appStyle}>
      <div
        style={{
          width: 220,
          background:
            theme === "dark"
              ? "#00091f"
              : "#dffcff",
          padding: 20,
          borderRight: "2px solid #00d9ff",
        }}
      >
        <h1 style={{ fontSize: 52 }}>
          Z Music
          <br />
          V20
        </h1>

        <button style={sideButton}>
          🎟️ Free + Ads
        </button>

        <div style={{ lineHeight: 2 }}>
          <div>🎵 Tracks: {tracks.length}</div>
          <div>❤️ Likes: {tracks.reduce((a, b) => a + b.likes, 0)}</div>
          <div>🔥 Plays: {tracks.reduce((a, b) => a + b.plays, 0)}</div>
          <div>🎧 Queue: {queue.length}</div>
        </div>

        <h2 style={{ marginTop: 40 }}>
          Creator Studio
        </h2>

        <button
          style={sideButton}
          onClick={() =>
            setShowUpload(!showUpload)
          }
        >
          Upload Track
        </button>

        <button
          style={sideButton}
          onClick={() =>
            setTheme(
              theme === "dark"
                ? "light"
                : "dark"
            )
          }
        >
          Toggle Theme
        </button>

        <button
          style={
            recording
              ? stopButton
              : startButton
          }
          onClick={() => {
            setRecording(!recording)

            if (!recording) {
              setRecordTime(0)
            }
          }}
        >
          {recording
            ? "Stop Recording"
            : "Start Recording"}
        </button>

        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 16,
            background:
              recording
                ? "rgba(255,0,0,.2)"
                : "rgba(0,255,120,.12)",
          }}
        >
          {recording
            ? "🔴 LIVE RECORDING"
            : "🟢 READY"}
          <br />
          ⏱️ {recordTime}s
        </div>
      </div>

      <div
        style={{
          flex: 1,
          padding: "30px 30px 90px",
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
          SPONSOR AD — V20 Creator Platform
        </div>

        <h1 style={{ fontSize: 64 }}>
          Music Business Platform V20
        </h1>

        <input
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          placeholder="Search music..."
          style={searchStyle}
        />

        {showUpload && (
          <div style={uploadBox}>
            <h2>Upload MP3</h2>

            <input
              value={artist}
              onChange={(e) =>
                setArtist(e.target.value)
              }
              placeholder="Artist"
              style={inputStyle}
            />

            <input
              value={title}
              onChange={(e) =>
                setTitle(e.target.value)
              }
              placeholder="Song Title"
              style={inputStyle}
            />

            <input
              value={producer}
              onChange={(e) =>
                setProducer(e.target.value)
              }
              placeholder="Producer"
              style={inputStyle}
            />

            <input
              value={genre}
              onChange={(e) =>
                setGenre(e.target.value)
              }
              placeholder="Genre"
              style={inputStyle}
            />

            <input
              value={cover}
              onChange={(e) =>
                setCover(e.target.value)
              }
              placeholder="Cover URL"
              style={inputStyle}
            />

            <input
              type="file"
              accept="audio/*"
              onChange={uploadTrack}
              style={{ marginTop: 20 }}
            />
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(420px,1fr))",
            gap: 24,
            marginTop: 30,
          }}
        >
          {filteredTracks.map((track) => (
            <div
              key={track.id}
              style={{
                background:
                  "rgba(0,0,40,.7)",
                border:
                  "2px solid #00d9ff",
                borderRadius: 24,
                overflow: "hidden",
              }}
            >
              <img
                src={track.cover}
                style={{
                  width: "100%",
                  height: 280,
                  objectFit: "cover",
                }}
              />

              <div style={{ padding: 24 }}>
                <h2 style={{ fontSize: 42 }}>
                  {track.artist}
                  {track.verified && (
                    <span
                      style={{
                        color: "#00d9ff",
                      }}
                    >
                      ✔
                    </span>
                  )}
                </h2>

                <h3>{track.title}</h3>

                <div style={{ lineHeight: 2 }}>
                  <div>
                    Producer: {track.producer}
                  </div>

                  <div>
                    Genre: {track.genre}
                  </div>

                  <div>
                    Plays: {track.plays}
                  </div>

                  <div>
                    Likes: {track.likes}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    marginTop: 20,
                  }}
                >
                  <button
                    style={playButton}
                    onClick={() =>
                      playTrack(track)
                    }
                  >
                    Play
                  </button>

                  <button
                    style={pauseButton}
                    onClick={pauseTrack}
                  >
                    Pause
                  </button>

                  <button
                    style={likeButton}
                    onClick={() =>
                      addLike(track.id)
                    }
                  >
                    Like
                  </button>

                  <button
                    style={deleteButton}
                    onClick={() =>
                      deleteTrack(track.id)
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          left: 220,
          right: 0,
          bottom: 0,
          height: 64,
          background:
            "rgba(0,0,40,.95)",
          borderTop:
            "2px solid #00d9ff",
          padding: "10px 18px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          zIndex: 40,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: "bold",
            }}
          >
            Now Playing
          </div>

          <div>
            {playing
              ? `${playing.artist} - ${playing.title}`
              : "No media playing"}
          </div>
        </div>

        <button
          style={playButton}
          onClick={() =>
            audioRef.current?.play()
          }
        >
          Play
        </button>

        <button
          style={pauseButton}
          onClick={() =>
            audioRef.current?.pause()
          }
        >
          Pause
        </button>

        <div
          style={{
            width: 240,
            height: 12,
            background:
              "rgba(255,255,255,.2)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background:
                "linear-gradient(90deg,#00d9ff,#ffe600)",
            }}
          />
        </div>

        <div>
          {currentTime} / {durationText}
        </div>
      </div>

      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (!audioRef.current) return

          const current =
            audioRef.current.currentTime

          const duration =
            audioRef.current.duration

          setCurrentTime(
            formatTime(current)
          )

          setDurationText(
            formatTime(duration)
          )

          setProgress(
            (current / duration) * 100 || 0
          )
        }}
      />
    </div>
  )
}

const sideButton = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "none",
  marginBottom: 12,
  background: "#97f3f3",
  fontWeight: "bold",
  cursor: "pointer",
}

const searchStyle = {
  width: "100%",
  padding: 18,
  borderRadius: 18,
  border: "2px solid #00d9ff",
  background: "#001040",
  color: "white",
  marginTop: 20,
  fontSize: 18,
}

const uploadBox = {
  marginTop: 30,
  padding: 20,
  borderRadius: 30,
  border: "3px dashed #00d9ff",
  background: "rgba(0,0,0,.3)",
}

const inputStyle = {
  width: "100%",
  padding: 16,
  marginBottom: 16,
  borderRadius: 14,
  border: "2px solid #00d9ff",
  background: "#001040",
  color: "white",
  fontSize: 16,
}

const playButton = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#00d9ff",
  fontWeight: "bold",
  cursor: "pointer",
}

const pauseButton = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "white",
  fontWeight: "bold",
  cursor: "pointer",
}

const likeButton = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#ffe600",
  fontWeight: "bold",
  cursor: "pointer",
}

const deleteButton = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#ff74b1",
  fontWeight: "bold",
  cursor: "pointer",
}

const startButton = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "none",
  marginTop: 12,
  background: "#8cff66",
  color: "black",
  fontWeight: "bold",
  cursor: "pointer",
}

const stopButton = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "none",
  marginTop: 12,
  background: "#ff4d6d",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
}