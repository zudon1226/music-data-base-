"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Plan = "free" | "premium" | "artistPro";
type MediaType = "audio" | "video";

type Upload = {
  id: number;
  artist: string;
  producer: string;
  title: string;
  genre: string;
  playlist: string;
  image: string;
  audio: string;
  video?: string;
  type: MediaType;
  favorite: boolean;
  plays: number;
  views: number;
  likes: number;
  rating: number;
  lyrics: string;
};

const starterUploads: Upload[] = [
  {
    id: 1,
    artist: "Drake",
    producer: "OVO",
    title: "God's Plan",
    genre: "Hip Hop",
    playlist: "Hits",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop",
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    type: "audio",
    favorite: true,
    plays: 0,
    views: 0,
    likes: 0,
    rating: 5,
    lyrics: "Add lyrics here...",
  },
  {
    id: 2,
    artist: "Kendrick Lamar",
    producer: "TDE",
    title: "HUMBLE",
    genre: "Hip Hop",
    playlist: "Workout",
    image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1200&auto=format&fit=crop",
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    type: "audio",
    favorite: false,
    plays: 0,
    views: 0,
    likes: 0,
    rating: 4,
    lyrics: "Add lyrics here...",
  },
];

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [queue, setQueue] = useState<Upload[]>([]);
  const [recent, setRecent] = useState<Upload[]>([]);
  const [current, setCurrent] = useState<Upload | null>(null);

  const [plan, setPlan] = useState<Plan>("free");
  const [tab, setTab] = useState<"library" | "upload" | "analytics" | "sponsors">("library");

  const [artist, setArtist] = useState("");
  const [producer, setProducer] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [playlist, setPlaylist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audioData, setAudioData] = useState("");
  const [videoData, setVideoData] = useState("");
  const [coverData, setCoverData] = useState("");

  const [search, setSearch] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState("All");
  const [mediaFilter, setMediaFilter] = useState<"all" | "audio" | "video">("all");

  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showFullPlayer, setShowFullPlayer] = useState(false);

  useEffect(() => {
    setUploads(JSON.parse(localStorage.getItem("z-v15-small") || "null") || starterUploads);
  }, []);

  useEffect(() => {
    localStorage.setItem("z-v15-small", JSON.stringify(uploads));
  }, [uploads]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const isPremium = plan !== "free";

  const playlists = useMemo(() => {
    return ["All", ...Array.from(new Set(uploads.map((u) => u.playlist)))];
  }, [uploads]);

  const filtered = uploads.filter((item) => {
    const text = search.toLowerCase();
    const match =
      item.artist.toLowerCase().includes(text) ||
      item.title.toLowerCase().includes(text) ||
      item.genre.toLowerCase().includes(text) ||
      item.producer.toLowerCase().includes(text);

    const playlistMatch = selectedPlaylist === "All" || item.playlist === selectedPlaylist;
    const mediaMatch = mediaFilter === "all" || item.type === mediaFilter;

    return match && playlistMatch && mediaMatch;
  });

  const totalPlays = uploads.reduce((a, b) => a + b.plays, 0);
  const totalViews = uploads.reduce((a, b) => a + b.views, 0);
  const totalLikes = uploads.reduce((a, b) => a + b.likes, 0);
  const earnings = (totalPlays * 0.004 + totalViews * 0.01 + totalLikes * 0.002).toFixed(2);

  function fileToDataUrl(file: File, callback: (value: string) => void) {
    const reader = new FileReader();
    reader.onload = () => callback(String(reader.result));
    reader.readAsDataURL(file);
  }

  function saveUpload() {
    if (!audioData && !videoData) {
      alert("Choose audio or video first.");
      return;
    }

    if (!isPremium && uploads.length >= 7) {
      alert("Free plan upload limit reached. Upgrade to Premium.");
      return;
    }

    const newUpload: Upload = {
      id: Date.now(),
      artist: artist || "Unknown Artist",
      producer: producer || "Unknown Producer",
      title: title || "Untitled Upload",
      genre: genre || "Unknown",
      playlist: playlist || "Uploads",
      image: coverData || "https://cdn-icons-png.flaticon.com/512/727/727245.png",
      audio: audioData,
      video: videoData,
      type: videoData ? "video" : "audio",
      favorite: false,
      plays: 0,
      views: 0,
      likes: 0,
      rating: 5,
      lyrics: lyrics || "No lyrics added.",
    };

    setUploads([newUpload, ...uploads]);
    setArtist("");
    setProducer("");
    setTitle("");
    setGenre("");
    setPlaylist("");
    setLyrics("");
    setAudioData("");
    setVideoData("");
    setCoverData("");
    setTab("library");
  }

  function playItem(item: Upload) {
    setCurrent(item);
    setRecent([item, ...recent.filter((r) => r.id !== item.id)].slice(0, 8));

    setUploads(
      uploads.map((u) =>
        u.id === item.id
          ? { ...u, plays: u.plays + 1, views: item.type === "video" ? u.views + 1 : u.views }
          : u
      )
    );

    setTimeout(() => {
      if (item.type === "video" && videoRef.current) {
        videoRef.current.src = item.video || "";
        videoRef.current.play();
      } else if (audioRef.current) {
        audioRef.current.src = item.audio;
        audioRef.current.play();
      }
    }, 100);
  }

  function togglePlay() {
    if (!current && filtered[0]) {
      playItem(filtered[0]);
      return;
    }

    const player = current?.type === "video" ? videoRef.current : audioRef.current;
    if (!player) return;

    if (player.paused) player.play();
    else player.pause();
  }

  function nextItem() {
    if (queue.length > 0) {
      const next = queue[0];
      setQueue(queue.slice(1));
      playItem(next);
      return;
    }

    if (filtered.length === 0) return;
    const index = filtered.findIndex((u) => u.id === current?.id);
    playItem(filtered[(index + 1) % filtered.length]);
  }

  return (
    <div style={page}>
      <aside style={sidebar}>
        <h1>Z Music</h1>

        <div style={planBadge}>
          {plan === "free" ? "🆓 Free + Ads" : plan === "premium" ? "👑 Premium" : "💼 Artist Pro"}
        </div>

        <p>🎵 Tracks: {uploads.filter((u) => u.type === "audio").length}</p>
        <p>🎬 Videos: {uploads.filter((u) => u.type === "video").length}</p>
        <p>⭐ Favorites: {uploads.filter((u) => u.favorite).length}</p>
        <p>🎧 Queue: {queue.length}</p>
        <p>🔥 Plays: {totalPlays}</p>
        <p>👁 Views: {totalViews}</p>
        <p>❤️ Likes: {totalLikes}</p>
        <p>💰 Earnings: ${earnings}</p>

        <h3>Plans</h3>
        <button style={sideButton} onClick={() => setPlan("free")}>Free</button>
        <button style={sideButton} onClick={() => setPlan("premium")}>Premium</button>
        <button style={sideButton} onClick={() => setPlan("artistPro")}>Artist Pro</button>

        <h3>Sections</h3>
        <button style={sideButton} onClick={() => setTab("library")}>Library</button>
        <button style={sideButton} onClick={() => setTab("upload")}>Upload</button>
        <button style={sideButton} onClick={() => setTab("analytics")}>Analytics</button>
        <button style={sideButton} onClick={() => setTab("sponsors")}>Sponsors</button>

        <h3>Playlists</h3>
        {playlists.map((p) => (
          <button
            key={p}
            style={{
              ...sideButton,
              background: selectedPlaylist === p ? "#ffe600" : "#334155",
              color: selectedPlaylist === p ? "#111" : "white",
            }}
            onClick={() => setSelectedPlaylist(p)}
          >
            {p}
          </button>
        ))}

        <button style={sideButton} onClick={() => current && setShowFullPlayer(true)}>Full Player</button>
      </aside>

      <main style={main}>
        {plan === "free" && (
          <div style={adBanner}>SPONSOR AD — Upgrade to Premium to remove ads.</div>
        )}

        <h1 style={titleStyle}>Music Business Platform V15</h1>

        {tab === "library" && (
          <>
            <input style={input} placeholder="Search artist, producer, song, genre..." value={search} onChange={(e) => setSearch(e.target.value)} />

            <select style={input} value={mediaFilter} onChange={(e) => setMediaFilter(e.target.value as any)}>
              <option value="all">All Media</option>
              <option value="audio">Music Only</option>
              <option value="video">Videos Only</option>
            </select>

            <div style={stats}>
              <Box label="Tracks" value={uploads.filter((u) => u.type === "audio").length} />
              <Box label="Videos" value={uploads.filter((u) => u.type === "video").length} />
              <Box label="Queue" value={queue.length} />
              <Box label="Plays" value={totalPlays} />
              <Box label="Earnings" value={Number(earnings)} />
            </div>

            <h2>Recently Played</h2>
            <div style={recentRow}>
              {recent.length === 0 && <p>Play music or video to build history.</p>}
              {recent.map((item) => (
                <div key={item.id} style={recentCard} onClick={() => playItem(item)}>
                  <img src={item.image} style={recentImage} />
                  <strong>{item.title}</strong>
                </div>
              ))}
            </div>

            <div style={grid}>
              {filtered.map((item) => (
                <div key={item.id} style={card}>
                  <div style={{ position: "relative" }}>
                    <img src={item.image} style={cover} />
                    <span style={tag}>{item.type === "video" ? "🎬 VIDEO" : "🎵 MUSIC"}</span>
                    {!isPremium && <span style={adTag}>AD</span>}
                  </div>

                  <div style={body}>
                    <h2>{item.artist}</h2>
                    <h3>{item.title}</h3>
                    <p>Producer: {item.producer}</p>
                    <p>Genre: {item.genre}</p>
                    <p>Playlist: {item.playlist}</p>
                    <p>Plays: {item.plays} | Views: {item.views}</p>
                    <p>Likes: {item.likes}</p>

                    <div style={buttonRow}>
                      <button style={blue} onClick={() => playItem(item)}>{item.type === "video" ? "Watch" : "Play"}</button>
                      <button style={white} onClick={() => setQueue([...queue, item])}>Queue</button>
                      <button style={yellow} onClick={() => setUploads(uploads.map((u) => u.id === item.id ? { ...u, favorite: !u.favorite } : u))}>
                        {item.favorite ? "♥" : "♡"}
                      </button>
                      <button style={green} onClick={() => setUploads(uploads.map((u) => u.id === item.id ? { ...u, likes: u.likes + 1 } : u))}>Like</button>
                      <button style={red} onClick={() => setUploads(uploads.filter((u) => u.id !== item.id))}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "upload" && (
          <section style={uploadForm}>
            <h2>Upload Music / Video</h2>
            <input style={input} placeholder="Artist Name" value={artist} onChange={(e) => setArtist(e.target.value)} />
            <input style={input} placeholder="Producer Name" value={producer} onChange={(e) => setProducer(e.target.value)} />
            <input style={input} placeholder="Song / Video Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input style={input} placeholder="Genre" value={genre} onChange={(e) => setGenre(e.target.value)} />
            <input style={input} placeholder="Playlist / Album" value={playlist} onChange={(e) => setPlaylist(e.target.value)} />
            <textarea style={textarea} placeholder="Lyrics / Description" value={lyrics} onChange={(e) => setLyrics(e.target.value)} />

            <div style={uploadBox}>
              <strong>🎵 Upload Audio</strong>
              <input type="file" accept="audio/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) fileToDataUrl(file, setAudioData);
              }} />

              <strong>🎬 Upload Music Video</strong>
              <input type="file" accept="video/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) fileToDataUrl(file, setVideoData);
              }} />

              <strong>🖼 Upload Cover / Thumbnail</strong>
              <input type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) fileToDataUrl(file, setCoverData);
              }} />
            </div>

            <button style={blue} onClick={saveUpload}>Save Upload</button>
          </section>
        )}

        {tab === "analytics" && (
          <section style={analyticsBox}>
            <h2>Analytics Dashboard</h2>
            <h1>${earnings}</h1>
            <p>Total Plays: {totalPlays}</p>
            <p>Total Views: {totalViews}</p>
            <p>Total Likes: {totalLikes}</p>
            <p>Artist Pro unlocks future monetization tools.</p>
          </section>
        )}

        {tab === "sponsors" && (
          <section style={analyticsBox}>
            <h2>Sponsor Manager</h2>
            <p>Free plan shows sponsor ads.</p>
            <p>Premium removes ads.</p>
            <p>Artist Pro will support sponsor placement and campaigns.</p>
          </section>
        )}
      </main>

      {showFullPlayer && current && (
        <section style={fullPlayer}>
          {current.type === "video" ? (
            <video src={current.video} controls autoPlay style={fullVideo} />
          ) : (
            <img src={current.image} style={fullCover} />
          )}

          <h1>{current.title}</h1>
          <h2>{current.artist}</h2>

          <div style={buttonRow}>
            <button style={blue} onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
            <button style={green} onClick={nextItem}>Next</button>
            <button style={red} onClick={() => setShowFullPlayer(false)}>Close</button>
          </div>
        </section>
      )}

      <footer style={player}>
        <div style={{ minWidth: 160 }}>
          <strong>Now Playing</strong>
          <div>{current ? `${current.artist} - ${current.title}` : "No media playing"}</div>
        </div>

        <Visualizer playing={playing} />

        <button style={blue} onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
        <button style={green} onClick={nextItem}>Next</button>
        <button style={yellow} onClick={() => setPlan(plan === "free" ? "premium" : "free")}>{isPremium ? "Premium" : "Upgrade"}</button>

        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        <span>Queue: {queue.length}</span>

        <audio ref={audioRef} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={nextItem} />
        <video ref={videoRef} style={{ display: "none" }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={nextItem} />
      </footer>
    </div>
  );
}

function Box({ label, value }: { label: string; value: number }) {
  return (
    <div style={statBox}>
      <strong>{label}</strong>
      <div style={{ fontSize: 28, fontWeight: "bold" }}>{value}</div>
    </div>
  );
}

function Visualizer({ playing }: { playing: boolean }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 32 }}>
      {[10, 18, 30, 22, 14, 26, 16].map((h, i) => (
        <div key={i} style={{ width: 6, height: playing ? h : 8, background: "#72f1ff", borderRadius: 10 }} />
      ))}
    </div>
  );
}

const page = { minHeight: "100vh", background: "linear-gradient(135deg,#020617,#002b66,#00d9ff)", color: "white", fontFamily: "Arial" };
const sidebar = { position: "fixed" as const, left: 0, top: 0, bottom: 0, width: 220, padding: 18, background: "rgba(0,0,0,.42)", borderRight: "2px solid #00d9ff", overflowY: "auto" as const };
const main = { marginLeft: 220, padding: "26px 28px 210px" };
const titleStyle = { fontSize: 46, margin: "0 0 18px" };
const input = { width: "100%", padding: 13, borderRadius: 14, border: "2px solid #00d9ff", background: "rgba(0,0,40,.58)", color: "white", marginBottom: 11, boxSizing: "border-box" as const };
const textarea = { ...input, height: 75 };
const stats = { display: "flex", gap: 12, flexWrap: "wrap" as const, margin: "18px 0" };
const statBox = { width: 115, padding: 14, border: "2px solid #4de3ff", borderRadius: 18, background: "rgba(0,0,0,.38)" };
const uploadForm = { display: "grid", gap: 8, marginBottom: 24 };
const uploadBox = { padding: 17, border: "2px dashed #00d9ff", borderRadius: 18, background: "rgba(0,0,0,.32)", display: "grid", gap: 8 };
const recentRow = { display: "flex", gap: 15, overflowX: "auto" as const, marginBottom: 24 };
const recentCard = { minWidth: 185, borderRadius: 18, overflow: "hidden", background: "rgba(0,0,0,.36)", border: "2px solid #00d9ff", cursor: "pointer", padding: 10 };
const recentImage = { width: "100%", height: 100, objectFit: "cover" as const, borderRadius: 12 };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(285px,1fr))", gap: 20 };
const card = { borderRadius: 23, overflow: "hidden", background: "rgba(0,0,50,.58)", border: "2px solid #00d9ff" };
const cover = { width: "100%", height: 205, objectFit: "cover" as const };
const body = { padding: 16 };
const buttonRow = { display: "flex", gap: 9, flexWrap: "wrap" as const };
const player = { position: "fixed" as const, left: 220, right: 0, bottom: 0, minHeight: 82, background: "rgba(0,0,40,.94)", borderTop: "2px solid #00d9ff", display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", overflowX: "auto" as const };
const sideButton = { width: "100%", padding: 10, marginBottom: 9, borderRadius: 11, border: "none", fontWeight: "bold", cursor: "pointer", background: "#9ffcff", color: "#111" };
const planBadge = { background: "#ffe600", color: "#111", padding: 10, borderRadius: 12, fontWeight: "bold", marginBottom: 12 };
const adBanner = { background: "linear-gradient(90deg,#ffe600,#ff74b1)", color: "#111", padding: 14, borderRadius: 16, fontWeight: "bold", marginBottom: 18 };
const tag = { position: "absolute" as const, top: 10, left: 10, background: "#ffe600", color: "#111", padding: "6px 10px", borderRadius: 10, fontWeight: "bold", fontSize: 12 };
const adTag = { position: "absolute" as const, top: 10, right: 10, background: "#ff74b1", color: "#111", padding: "6px 10px", borderRadius: 10, fontWeight: "bold", fontSize: 12 };
const analyticsBox = { background: "rgba(0,0,0,.38)", border: "2px solid #00d9ff", borderRadius: 22, padding: 22 };
const fullPlayer = { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.94)", zIndex: 100, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: 30 };
const fullCover = { width: 280, height: 280, objectFit: "cover" as const, borderRadius: 28 };
const fullVideo = { width: "75vw", maxHeight: "55vh", borderRadius: 24 };
const blue = { background: "#2de2ff", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const green = { background: "#80ed99", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const yellow = { background: "#ffe600", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const red = { background: "#ff74b1", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const white = { background: "white", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };