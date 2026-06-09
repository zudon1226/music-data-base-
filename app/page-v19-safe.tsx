"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Song = {
  id: number
  artist: string
  title: string
  producer: string
  genre: string
  playlist: string
  cover: string
  audio?: string
  verified?: boolean
  likes: number
  comments: string[]
  views: number
}

export default function Page() {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [songs, setSongs] = useState<Song[]>([
    {
      id: 1,
      artist: "Drake",
      title: "God's Plan",
      producer: "OVO",
      genre: "Hip Hop",
      playlist: "Hits",
      cover:
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1600&auto=format&fit=crop",
      verified: true,
      likes: 0,
      comments: [],
      views: 0,
    },
    {
      id: 2,
      artist: "Kendrick Lamar",
      title: "HUMBLE",
      producer: "TDE",
      genre: "Hip Hop",
      playlist: "Workout",
      cover:
        "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1600&auto=format&fit=crop",
      verified: true,
      likes: 0,
      comments: [],
      views: 0,
    },
  ])

  const [search, setSearch] = useState("")
  const [queue, setQueue] = useState<Song[]>([])
  const [playing, setPlaying] = useState<Song | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [fullVideo, setFullVideo] = useState(false)

  const [artist, setArtist] = useState("")
  const [title, setTitle] = useState("")
  const [producer, setProducer] = useState("")
  const [genre, setGenre] = useState("")
  const [playlist, setPlaylist] = useState("")
  const [cover, setCover] = useState("")

  const filteredSongs = useMemo(() => {
    return songs.filter((song) =>
      `${song.artist} ${song.title} ${song.genre}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }, [songs, search])

  function addSong() {
    if (!artist || !title) return

    const newSong: Song = {
      id: Date.now(),
      artist,
      title,
      producer,
      genre,
      playlist,
      cover:
        cover ||
        "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?q=80&w=1600&auto=format&fit=crop",
      verified: false,
      likes: 0,
      comments: [],
      views: 0,
    }

    setSongs([newSong, ...songs])

    setArtist("")
    setTitle("")
    setProducer("")
    setGenre("")
    setPlaylist("")
    setCover("")
  }

  function playSong(song: Song) {
    setPlaying(song)

    setSongs((prev) =>
      prev.map((s) =>
        s.id === song.id ? { ...s, views: s.views + 1 } : s
      )
    )
  }

  function likeSong(id: number) {
    setSongs((prev) =>
      prev.map((song) =>
        song.id === id ? { ...song, likes: song.likes + 1 } : song
      )
    )
  }

  function addComment(id: number, comment: string) {
    if (!comment) return

    setSongs((prev) =>
      prev.map((song) =>
        song.id === id
          ? { ...song, comments: [...song.comments, comment] }
          : song
      )
    )
  }

  function addToQueue(song: Song) {
    setQueue((prev) => [...prev, song])
  }

  function removeSong(id: number) {
    setSongs((prev) => prev.filter((song) => song.id !== id))
  }

  const stats = {
    tracks: songs.length,
    artists: songs.length,
    queue: queue.length,
    plays: songs.reduce((a, b) => a + b.views, 0),
    earnings: songs.reduce((a, b) => a + b.likes, 0) * 0.25,
  }

  const app = {
    display: "flex",
    minHeight: "100vh",
    background: "linear-gradient(135deg,#00154d,#00cfff)",
    color: "white",
    fontFamily: "Arial",
  } as const

  const sidebar = {
    width: 220,
    background: "#00091f",
    padding: 20,
    borderRight: "2px solid #00d9ff",
  }

  const button = {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    border: "none",
    marginBottom: 12,
    background: "#97f3f3",
    fontWeight: "bold",
    cursor: "pointer",
  }

  const card = {
    background: "rgba(0,0,40,.7)",
    border: "2px solid #00d9ff",
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 30,
  }

  const action = {
    border: "none",
    borderRadius: 10,
    padding: "10px 14px",
    fontWeight: "bold",
    cursor: "pointer",
  }

  return (
    <div style={app}>
      <div style={sidebar}>
        <h1 style={{ fontSize: 52, marginBottom: 20 }}>
          Z Music
          <br />
          V18
        </h1>

        <button style={{ ...button, background: "#ffe600" }}>
          🎟️ Free + Ads
        </button>

        <div style={{ lineHeight: 2.1 }}>
          <div>🎵 Tracks: {stats.tracks}</div>
          <div>🎬 Videos: 0</div>
          <div>⭐ Favorites: 1</div>
          <div>👥 Artists: {stats.artists}</div>
          <div>🎧 Queue: {stats.queue}</div>
          <div>🔥 Plays: {stats.plays}</div>
          <div>👁️ Views: {stats.plays}</div>
          <div>❤️ Likes: {songs.reduce((a, b) => a + b.likes, 0)}</div>
          <div>💰 Earnings: ${stats.earnings.toFixed(2)}</div>
        </div>

        <h2 style={{ marginTop: 40 }}>Sections</h2>

        <button style={button}>Library</button>

        <button
          style={button}
          onClick={() => setShowUpload(!showUpload)}
        >
          Drag Upload
        </button>

        <button style={button}>Artist Profiles</button>
        <button style={button}>Playlist Creator</button>
        <button style={button}>Trending</button>
        <button style={button}>Analytics</button>
        <button style={button}>Sponsors</button>

        <button
          style={{ ...button, background: "#b0ffff" }}
          onClick={() => setFullVideo(!fullVideo)}
        >
          Full Video Mode
        </button>
      </div>

      <div style={{ flex: 1, padding: 30 }}>
        <div
          style={{
            background:
              "linear-gradient(90deg,#ffe600,#ff9d5c,#ff5cb8)",
            color: "black",
            fontWeight: "bold",
            padding: 18,
            borderRadius: 18,
            marginBottom: 20,
          }}
        >
          SPONSOR AD — V18 Creator Platform
        </div>

        <h1 style={{ fontSize: 64, marginBottom: 20 }}>
          Music Business Platform V18
        </h1>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search artist, producer, song, genre..."
          style={{
            width: "100%",
            padding: 18,
            borderRadius: 18,
            border: "2px solid #00d9ff",
            background: "#001040",
            color: "white",
            marginBottom: 20,
            fontSize: 18,
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 20,
            marginBottom: 30,
          }}
        >
          {[
            ["Tracks", stats.tracks],
            ["Artists", stats.artists],
            ["Queue", stats.queue],
            ["Plays", stats.plays],
            ["Earnings", `$${stats.earnings.toFixed(2)}`],
          ].map(([name, value]) => (
            <div
              key={String(name)}
              style={{
                border: "2px solid #00d9ff",
                borderRadius: 24,
                padding: 24,
                background: "rgba(0,0,40,.6)",
              }}
            >
              <div style={{ fontWeight: "bold", fontSize: 28 }}>
                {name}
              </div>
              <div style={{ fontSize: 54, fontWeight: "bold" }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {showUpload && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
            }}
            style={{
              border: dragging
                ? "4px solid #ffe600"
                : "3px dashed #00d9ff",
              borderRadius: 30,
              padding: 30,
              marginBottom: 30,
              background: "rgba(0,0,0,.35)",
            }}
          >
            <h2>Drag & Drop Upload Zone</h2>

            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artist"
              style={uploadInput}
            />

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song Title"
              style={uploadInput}
            />

            <input
              value={producer}
              onChange={(e) => setProducer(e.target.value)}
              placeholder="Producer"
              style={uploadInput}
            />

            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="Genre"
              style={uploadInput}
            />

            <input
              value={playlist}
              onChange={(e) => setPlaylist(e.target.value)}
              placeholder="Playlist"
              style={uploadInput}
            />

            <input
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              placeholder="Cover Image URL"
              style={uploadInput}
            />

            <button
              onClick={addSong}
              style={{
                ...action,
                background: "#00d9ff",
                marginTop: 10,
              }}
            >
              Upload Song
            </button>
          </div>
        )}

        <h2 style={{ fontSize: 44 }}>Trending Artists</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(420px,1fr))",
            gap: 24,
          }}
        >
          {filteredSongs.map((song) => (
            <div key={song.id} style={card}>
              <img
                src={song.cover}
                style={{
                  width: "100%",
                  height: 280,
                  objectFit: "cover",
                }}
              />

              <div style={{ padding: 24 }}>
                <h2 style={{ fontSize: 42 }}>
                  {song.artist}{" "}
                  {song.verified && (
                    <span style={{ color: "#00d9ff" }}>✔</span>
                  )}
                </h2>

                <h3 style={{ fontSize: 28 }}>{song.title}</h3>

                <div style={{ lineHeight: 2, fontSize: 20 }}>
                  <div>Producer: {song.producer}</div>
                  <div>Genre: {song.genre}</div>
                  <div>Playlist: {song.playlist}</div>
                  <div>Views: {song.views}</div>
                  <div>Likes: {song.likes}</div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    marginTop: 20,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    style={{
                      ...action,
                      background: "#00d9ff",
                    }}
                    onClick={() => playSong(song)}
                  >
                    Play
                  </button>

                  <button
                    style={{
                      ...action,
                      background: "white",
                    }}
                    onClick={() => addToQueue(song)}
                  >
                    Queue
                  </button>

                  <button
                    style={{
                      ...action,
                      background: "#90ee90",
                    }}
                    onClick={() => likeSong(song.id)}
                  >
                    Like
                  </button>

                  <button
                    style={{
                      ...action,
                      background: "#ff74b1",
                    }}
                    onClick={() => removeSong(song.id)}
                  >
                    Delete
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 20,
                    background: "rgba(255,255,255,.08)",
                    padding: 20,
                    borderRadius: 20,
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    Comments: {song.comments.length}
                  </div>

                  <input
                    placeholder="Add comment"
                    style={{
                      width: "100%",
                      padding: 14,
                      borderRadius: 12,
                      border: "2px solid #00d9ff",
                      background: "#001040",
                      color: "white",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        addComment(song.id, e.currentTarget.value)
                        e.currentTarget.value = ""
                      }
                    }}
                  />

                  {song.comments.map((comment, i) => (
                    <div
                      key={i}
                      style={{
                        marginTop: 10,
                        padding: 10,
                        background: "rgba(255,255,255,.05)",
                        borderRadius: 10,
                      }}
                    >
                      {comment}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 220,
          right: 0,
          background: "rgba(0,0,40,.95)",
          borderTop: "2px solid #00d9ff",
          padding: 18,
          display: "flex",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div>
          <div style={{ fontWeight: "bold" }}>Now Playing</div>
          <div>{playing ? playing.title : "No media playing"}</div>
        </div>

        <button style={{ ...action, background: "#00d9ff" }}>
          Play
        </button>

        <button style={{ ...action, background: "#90ee90" }}>
          Next
        </button>

        <button style={{ ...action, background: "#ffe600" }}>
          Upgrade
        </button>

        <div
          style={{
            height: 10,
            width: 220,
            borderRadius: 999,
            background: "rgba(255,255,255,.2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "35%",
              height: "100%",
              background:
                "linear-gradient(90deg,#00d9ff,#ffe600)",
            }}
          />
        </div>

        <div>Queue: {queue.length}</div>
      </div>

      {fullVideo && playing && (
        <div
          onClick={() => setFullVideo(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.95)",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            padding: 40,
          }}
        >
          <img
            src={playing.cover}
            style={{
              width: "70vw",
              maxHeight: "70vh",
              objectFit: "cover",
              borderRadius: 30,
              boxShadow: "0 0 40px #00d9ff",
            }}
          />

          <h1 style={{ fontSize: 64 }}>
            {playing.artist} — {playing.title}
          </h1>

          <div>Tap anywhere to exit Full Video Mode</div>
        </div>
      )}

      <audio ref={audioRef} />
    </div>
  )
}

const uploadInput = {
  width: "100%",
  padding: 16,
  marginBottom: 16,
  borderRadius: 14,
  border: "2px solid #00d9ff",
  background: "#001040",
  color: "white",
  fontSize: 16,
}