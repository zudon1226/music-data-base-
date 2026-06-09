"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Plan = "free" | "premium";

type MediaType = "audio" | "video";

type Song = {
  id: number;
  artist: string;
  title: string;
  genre: string;
  playlist: string;
  duration: string;
  image: string;
  audio: string;
  video?: string;
  type: MediaType;
  favorite: boolean;
  plays: number;
  views: number;
  rating: number;
  addedAt: number;
  lyrics: string;
  producer: string;
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
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    type: "audio",
    favorite: true,
    plays: 0,
    views: 0,
    rating: 5,
    addedAt: Date.now(),
    lyrics: "Add lyrics here...",
    producer: "OVO",
  },
  {
    id: 2,
    artist: "Kendrick Lamar",
    title: "HUMBLE",
    genre: "Hip Hop",
    playlist: "Workout",
    duration: "7:05",
    image:
      "https://images.unsplash.com/photo-1511379938547-c1f69419868d?q=80&w=1200&auto=format&fit=crop",
    audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    type: "audio",
    favorite: false,
    plays: 0,
    views: 0,
    rating: 4,
    addedAt: Date.now(),
    lyrics: "Add lyrics here...",
    producer: "TDE",
  },
];

export default function Home() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [songs, setSongs] = useState<Song[]>([]);
  const [queue, setQueue] = useState<Song[]>([]);
  const [recent, setRecent] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);

  const [plan, setPlan] = useState<Plan>("free");

  const [artist, setArtist] = useState("");
  const [producer, setProducer] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [playlist, setPlaylist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audioData, setAudioData] = useState("");
  const [videoData, setVideoData] = useState("");
  const [coverData, setCoverData] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [selectedPlaylist, setSelectedPlaylist] = useState("All");
  const [sortMode, setSortMode] = useState("newest");
  const [mediaFilter, setMediaFilter] = useState<"all" | "audio" | "video">("all");

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const [showUpload, setShowUpload] = useState(true);
  const [compactCards, setCompactCards] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [theme, setTheme] = useState("#00d9ff");
  const [lightMode, setLightMode] = useState(false);

  useEffect(() => {
    setSongs(JSON.parse(localStorage.getItem("z-music-v14") || "null") || starterSongs);
    setRecent(JSON.parse(localStorage.getItem("z-music-v14-recent") || "[]"));
    setQueue(JSON.parse(localStorage.getItem("z-music-v14-queue") || "[]"));
    setPlan((localStorage.getItem("z-music-v14-plan") as Plan) || "free");
  }, []);

  useEffect(() => localStorage.setItem("z-music-v14", JSON.stringify(songs)), [songs]);
  useEffect(() => localStorage.setItem("z-music-v14-recent", JSON.stringify(recent)), [recent]);
  useEffect(() => localStorage.setItem("z-music-v14-queue", JSON.stringify(queue)), [queue]);
  useEffect(() => localStorage.setItem("z-music-v14-plan", plan), [plan]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    if (videoRef.current) videoRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const isPremium = plan === "premium";

  const playlists = useMemo(() => {
    return ["All", ...Array.from(new Set(songs.map((s) => s.playlist)))];
  }, [songs]);

  const filteredSongs = useMemo(() => {
    let list = songs.filter((song) => {
      const text = search.toLowerCase();
      const match =
        song.artist.toLowerCase().includes(text) ||
        song.title.toLowerCase().includes(text) ||
        song.genre.toLowerCase().includes(text) ||
        song.playlist.toLowerCase().includes(text) ||
        song.producer.toLowerCase().includes(text);

      const playlistMatch = selectedPlaylist === "All" || song.playlist === selectedPlaylist;
      const mediaMatch = mediaFilter === "all" || song.type === mediaFilter;

      return match && playlistMatch && mediaMatch;
    });

    if (sortMode === "artist") list = [...list].sort((a, b) => a.artist.localeCompare(b.artist));
    if (sortMode === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sortMode === "plays") list = [...list].sort((a, b) => b.plays - a.plays);
    if (sortMode === "views") list = [...list].sort((a, b) => b.views - a.views);
    if (sortMode === "rating") list = [...list].sort((a, b) => b.rating - a.rating);
    if (sortMode === "newest") list = [...list].sort((a, b) => b.addedAt - a.addedAt);

    return list;
  }, [songs, search, selectedPlaylist, sortMode, mediaFilter]);

  function fileToDataUrl(file: File, callback: (value: string) => void) {
    const reader = new FileReader();
    reader.onload = () => callback(String(reader.result));
    reader.readAsDataURL(file);
  }

  function formatTime(time: number) {
    if (!time || Number.isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function clearForm() {
    setArtist("");
    setProducer("");
    setTitle("");
    setGenre("");
    setPlaylist("");
    setLyrics("");
    setAudioData("");
    setVideoData("");
    setCoverData("");
    setEditingId(null);
  }

  function saveSong() {
    if (!audioData && !videoData && !editingId) {
      alert("Choose an MP3/audio file or MP4/video file first.");
      return;
    }

    if (!isPremium && songs.filter((s) => s.id > 2).length >= 5 && !editingId) {
      alert("Free version allows 5 uploads. Upgrade to Premium for unlimited uploads.");
      return;
    }

    if (editingId) {
      setSongs(
        songs.map((song) =>
          song.id === editingId
            ? {
                ...song,
                artist: artist || song.artist,
                producer: producer || song.producer,
                title: title || song.title,
                genre: genre || song.genre,
                playlist: playlist || song.playlist,
                lyrics: lyrics || song.lyrics,
                image: coverData || song.image,
                audio: audioData || song.audio,
                video: videoData || song.video,
                type: videoData ? "video" : song.type,
              }
            : song
        )
      );
      clearForm();
      return;
    }

    const newSong: Song = {
      id: Date.now(),
      artist: artist || "Unknown Artist",
      producer: producer || "Unknown Producer",
      title: title || "Untitled Upload",
      genre: genre || "Unknown",
      playlist: playlist || "Uploads",
      duration: "Auto",
      image: coverData || "https://cdn-icons-png.flaticon.com/512/727/727245.png",
      audio: audioData || "",
      video: videoData || "",
      type: videoData ? "video" : "audio",
      favorite: false,
      plays: 0,
      views: 0,
      rating: 5,
      addedAt: Date.now(),
      lyrics: lyrics || "No lyrics added.",
    };

    setSongs([newSong, ...songs]);
    clearForm();
  }

  function editSong(song: Song) {
    setEditingId(song.id);
    setArtist(song.artist);
    setProducer(song.producer);
    setTitle(song.title);
    setGenre(song.genre);
    setPlaylist(song.playlist);
    setLyrics(song.lyrics);
    setShowUpload(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function playSong(song: Song) {
    setCurrentSong(song);
    setSongs((prev) =>
      prev.map((s) =>
        s.id === song.id
          ? { ...s, plays: s.plays + 1, views: song.type === "video" ? s.views + 1 : s.views }
          : s
      )
    );
    setRecent((prev) => [song, ...prev.filter((s) => s.id !== song.id)].slice(0, 10));

    setTimeout(() => {
      if (song.type === "video" && videoRef.current) {
        videoRef.current.src = song.video || "";
        videoRef.current.volume = muted ? 0 : volume;
        videoRef.current.play();
      } else if (audioRef.current) {
        audioRef.current.src = song.audio;
        audioRef.current.volume = muted ? 0 : volume;
        audioRef.current.play();
      }
    }, 100);
  }

  function togglePlay() {
    const player = currentSong?.type === "video" ? videoRef.current : audioRef.current;

    if (!currentSong && filteredSongs[0]) {
      playSong(filteredSongs[0]);
      return;
    }

    if (!player) return;

    if (player.paused) player.play();
    else player.pause();
  }

  function nextSong() {
    if (!isPremium && currentSong && currentSong.plays > 0 && currentSong.plays % 3 === 0) {
      alert("Sponsor Ad: Upgrade to Premium to remove ads.");
    }

    if (queue.length > 0) {
      const next = queue[0];
      setQueue(queue.slice(1));
      playSong(next);
      return;
    }

    if (filteredSongs.length === 0) return;
    const index = filteredSongs.findIndex((s) => s.id === currentSong?.id);
    playSong(filteredSongs[(index + 1) % filteredSongs.length]);
  }

  function prevSong() {
    if (filteredSongs.length === 0) return;
    const index = filteredSongs.findIndex((s) => s.id === currentSong?.id);
    playSong(filteredSongs[(index - 1 + filteredSongs.length) % filteredSongs.length]);
  }

  function exportLibrary() {
    const blob = new Blob([JSON.stringify(songs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "z-music-library-v14.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      style={{
        ...page,
        background: lightMode ? "#dbeafe" : `linear-gradient(135deg,#020617,#002b66,${theme})`,
        color: lightMode ? "#111" : "white",
      }}
    >
      <aside style={sidebar}>
        <h1 style={{ marginTop: 0 }}>Z Music</h1>

        <div style={planBadge}>{isPremium ? "👑 Premium" : "🆓 Free + Ads"}</div>

        <p>🏠 Dashboard</p>
        <p>⭐ Favorites: {songs.filter((s) => s.favorite).length}</p>
        <p>🎵 Tracks: {songs.filter((s) => s.type === "audio").length}</p>
        <p>🎬 Videos: {songs.filter((s) => s.type === "video").length}</p>
        <p>⬆️ Uploads: {songs.filter((s) => s.id > 2).length}</p>
        <p>🎧 Queue: {queue.length}</p>
        <p>🔥 Plays: {songs.reduce((a, b) => a + b.plays, 0)}</p>

        <h3>Plans</h3>
        <button style={sideButtonAqua} onClick={() => setShowPricing(true)}>Pricing</button>
        <button style={sideButtonAqua} onClick={() => setPlan(isPremium ? "free" : "premium")}>
          {isPremium ? "Switch Free" : "Upgrade Demo"}
        </button>

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

        <h3>Views</h3>
        <button style={sideButtonAqua} onClick={() => setShowQueue(!showQueue)}>Queue Panel</button>
        <button style={sideButtonAqua} onClick={() => setShowUpload(!showUpload)}>
          {showUpload ? "Hide Upload" : "Show Upload"}
        </button>
        <button style={sideButtonAqua} onClick={() => setCompactCards(!compactCards)}>
          {compactCards ? "Large Cards" : "Compact Cards"}
        </button>
        <button style={sideButtonAqua} onClick={() => currentSong && setShowFullPlayer(true)}>Full Player</button>
        <button style={sideButtonAqua} onClick={() => setLightMode(!lightMode)}>
          {lightMode ? "Dark Mode" : "Light Mode"}
        </button>
        <button style={sideButtonAqua} onClick={exportLibrary}>Export Library</button>

        <h3>Themes</h3>
        <div style={themeRow}>
          {["#00d9ff", "#ff8a00", "#9b5de5", "#80ed99", "#ffe600", "#ff74b1"].map((c) => (
            <button key={c} onClick={() => setTheme(c)} style={{ ...themeDot, background: c }} />
          ))}
        </div>
      </aside>

      <main style={main}>
        {!isPremium && (
          <div style={adBanner}>
            SPONSOR AD — Your brand, artist promo, or producer spotlight goes here. Upgrade to Premium to remove ads.
          </div>
        )}

        <h1 style={titleStyle}>Music Data Base V14</h1>

        <input style={input} placeholder="Search artist, producer, song, genre..." value={search} onChange={(e) => setSearch(e.target.value)} />

        <div style={filterRow}>
          <select style={input} value={sortMode} onChange={(e) => setSortMode(e.target.value)}>
            <option value="newest">Sort Newest</option>
            <option value="artist">Artist A-Z</option>
            <option value="title">Song Title</option>
            <option value="plays">Most Plays</option>
            <option value="views">Most Views</option>
            <option value="rating">Top Rated</option>
          </select>

          <select style={input} value={mediaFilter} onChange={(e) => setMediaFilter(e.target.value as any)}>
            <option value="all">All Media</option>
            <option value="audio">Music Only</option>
            <option value="video">Videos Only</option>
          </select>
        </div>

        <div style={stats}>
          <Box label="Songs" value={songs.filter((s) => s.type === "audio").length} />
          <Box label="Videos" value={songs.filter((s) => s.type === "video").length} />
          <Box label="Favorites" value={songs.filter((s) => s.favorite).length} />
          <Box label="Uploads" value={songs.filter((s) => s.id > 2).length} />
          <Box label="Queue" value={queue.length} />
          <Box label="Plays" value={songs.reduce((a, b) => a + b.plays, 0)} />
        </div>

        {showUpload && (
          <div style={uploadForm}>
            <input style={input} placeholder="Artist Name" value={artist} onChange={(e) => setArtist(e.target.value)} />
            <input style={input} placeholder="Producer Name" value={producer} onChange={(e) => setProducer(e.target.value)} />
            <input style={input} placeholder="Song / Video Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input style={input} placeholder="Genre" value={genre} onChange={(e) => setGenre(e.target.value)} />
            <input style={input} placeholder="Playlist / Album" value={playlist} onChange={(e) => setPlaylist(e.target.value)} />
            <textarea style={textarea} placeholder="Lyrics / Video Description" value={lyrics} onChange={(e) => setLyrics(e.target.value)} />

            <div style={uploadBox}>
              <strong>🎵 Upload MP3 / Audio</strong>
              <input type="file" accept="audio/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) fileToDataUrl(file, setAudioData);
              }} />

              <strong>🎬 Upload Music Video MP4</strong>
              <input type="file" accept="video/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) fileToDataUrl(file, setVideoData);
              }} />

              <strong>🖼 Upload Cover / Thumbnail</strong>
              <input type="file" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) fileToDataUrl(file, setCoverData);
              }} />

              {coverData && <img src={coverData} style={previewImage} />}
            </div>

            <div style={buttonRow}>
              <button style={blue} onClick={saveSong}>{editingId ? "Update Upload" : "Save Upload"}</button>
              <button style={white} onClick={clearForm}>Clear Form</button>
              <button style={green} onClick={() => setSongs([...songs].sort(() => Math.random() - 0.5))}>Shuffle</button>
              <button style={red} onClick={() => setSongs(starterSongs)}>Reset</button>
            </div>
          </div>
        )}

        <h2>Recently Played</h2>
        <div style={recentRow}>
          {recent.length === 0 && <p>Play a song/video to build history.</p>}
          {recent.map((song) => (
            <div key={song.id} style={recentCard} onClick={() => playSong(song)}>
              <img src={song.image} style={recentImage} />
              <div style={{ padding: 10 }}>
                <strong>{song.artist}</strong>
                <div>{song.title}</div>
                <small>{song.type === "video" ? "🎬 Video" : "🎵 Music"}</small>
              </div>
            </div>
          ))}
        </div>

        <div style={compactCards ? compactGrid : grid}>
          {filteredSongs.map((song) => (
            <div
              key={song.id}
              style={{
                ...card,
                border: currentSong?.id === song.id ? "3px solid #ffe600" : `2px solid ${theme}`,
              }}
            >
              <div style={{ position: "relative" }}>
                <img src={song.image} style={compactCards ? compactCover : cover} />
                <span style={mediaTag}>{song.type === "video" ? "🎬 VIDEO" : "🎵 MUSIC"}</span>
                {!isPremium && <span style={sponsorTag}>AD</span>}
              </div>

              <div style={body}>
                <h2>{song.artist}</h2>
                <h3>{song.title}</h3>
                <p>Producer: {song.producer}</p>
                <p>Genre: {song.genre}</p>
                <p>Playlist: {song.playlist}</p>
                <p>Plays: {song.plays} | Views: {song.views}</p>

                <div>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      onClick={() => setSongs(songs.map((s) => (s.id === song.id ? { ...s, rating: star } : s)))}
                      style={{ cursor: "pointer", fontSize: 20 }}
                    >
                      {star <= song.rating ? "⭐" : "☆"}
                    </span>
                  ))}
                </div>

                <div style={buttonRow}>
                  <button style={blue} onClick={() => playSong(song)}>{song.type === "video" ? "Watch" : "Play"}</button>
                  <button style={white} onClick={() => setQueue([...queue, song])}>Queue</button>
                  <button style={yellow} onClick={() => setSongs(songs.map((s) => (s.id === song.id ? { ...s, favorite: !s.favorite } : s)))}>
                    {song.favorite ? "♥" : "♡"}
                  </button>
                  <button style={green} onClick={() => editSong(song)}>Edit</button>
                  <button style={red} onClick={() => setSongs(songs.filter((s) => s.id !== song.id))}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {showPricing && (
        <section style={modal}>
          <div style={pricingBox}>
            <h1>Z Music Plans</h1>
            <div style={pricingGrid}>
              <div style={priceCard}>
                <h2>Free</h2>
                <h3>$0/month</h3>
                <p>Ads included</p>
                <p>5 uploads</p>
                <p>Music + video playback</p>
                <button style={white} onClick={() => { setPlan("free"); setShowPricing(false); }}>Use Free</button>
              </div>
              <div style={priceCardPremium}>
                <h2>Premium</h2>
                <h3>$4.99/month</h3>
                <p>No sponsor ads</p>
                <p>Unlimited uploads</p>
                <p>Music videos</p>
                <p>Artist/producer tools</p>
                <button style={yellow} onClick={() => { setPlan("premium"); setShowPricing(false); }}>Upgrade Demo</button>
              </div>
              <div style={priceCard}>
                <h2>Artist Pro</h2>
                <h3>$9.99/month</h3>
                <p>Monetization tools</p>
                <p>Sponsored placement</p>
                <p>Analytics dashboard</p>
                <button style={blue} onClick={() => { setPlan("premium"); setShowPricing(false); }}>Try Pro Demo</button>
              </div>
            </div>
            <button style={red} onClick={() => setShowPricing(false)}>Close</button>
          </div>
        </section>
      )}

      {showQueue && (
        <section style={queuePanel}>
          <h2>Queue</h2>
          {queue.length === 0 && <p>No songs queued.</p>}
          {queue.map((song, index) => (
            <div key={`${song.id}-${index}`} style={queueItem}>
              <img src={song.image} style={queueImage} />
              <div style={{ flex: 1 }}>
                <strong>{song.title}</strong>
                <div>{song.artist}</div>
              </div>
              <button style={blue} onClick={() => playSong(song)}>Play</button>
              <button style={red} onClick={() => setQueue(queue.filter((_, i) => i !== index))}>X</button>
            </div>
          ))}
        </section>
      )}

      {showFullPlayer && currentSong && (
        <section style={fullPlayer}>
          {currentSong.type === "video" ? (
            <video src={currentSong.video} controls autoPlay style={fullVideo} />
          ) : (
            <img src={currentSong.image} style={fullCover} />
          )}

          <h1>{currentSong.title}</h1>
          <h2>{currentSong.artist}</h2>
          <p>Producer: {currentSong.producer}</p>
          <pre style={lyricsBox}>{currentSong.lyrics}</pre>
          <Visualizer playing={playing} large />
          <div style={buttonRow}>
            <button style={white} onClick={prevSong}>Prev</button>
            <button style={blue} onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
            <button style={green} onClick={nextSong}>Next</button>
            <button style={red} onClick={() => setShowFullPlayer(false)}>Close</button>
          </div>
        </section>
      )}

      <footer style={player}>
        <div style={{ minWidth: 150 }}>
          <strong>Now Playing</strong>
          <div>{currentSong ? `${currentSong.artist} - ${currentSong.title}` : "No song playing"}</div>
        </div>

        <Visualizer playing={playing} />

        <button style={white} onClick={prevSong}>Prev</button>
        <button style={blue} onClick={togglePlay}>{playing ? "Pause" : "Play"}</button>
        <button style={green} onClick={nextSong}>Next</button>
        <button style={yellow} onClick={() => setShowPricing(true)}>{isPremium ? "Premium" : "Upgrade"}</button>
        <button style={blue} onClick={() => setMuted(!muted)}>{muted ? "Unmute" : "Mute"}</button>

        <span>{formatTime(progress)}</span>

        <input
          type="range"
          min="0"
          max={duration || 0}
          value={progress}
          onChange={(e) => {
            const value = Number(e.target.value);
            const player = currentSong?.type === "video" ? videoRef.current : audioRef.current;
            if (player) player.currentTime = value;
            setProgress(value);
          }}
          style={{ flex: 1, minWidth: 120 }}
        />

        <span>{formatTime(duration)}</span>

        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ width: 100 }} />
        <span>Queue: {queue.length}</span>

        <audio
          ref={audioRef}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={nextSong}
        />

        <video
          ref={videoRef}
          style={{ display: "none" }}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={nextSong}
        />
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

function Visualizer({ playing, large = false }: { playing: boolean; large?: boolean }) {
  return (
    <div style={{ display: "flex", gap: large ? 7 : 4, alignItems: "flex-end", height: large ? 80 : 36 }}>
      {[10, 18, 30, 22, 14, 26, 16, 34, 20].map((h, i) => (
        <div
          key={i}
          style={{
            width: large ? 10 : 6,
            height: playing ? h * (large ? 1.8 : 1) : 8,
            background: "#72f1ff",
            borderRadius: 10,
            transition: ".2s",
          }}
        />
      ))}
    </div>
  );
}

const page = { minHeight: "100vh", fontFamily: "Arial" };
const sidebar = { position: "fixed" as const, left: 0, top: 0, bottom: 0, width: 220, padding: 18, background: "rgba(0,0,0,.42)", borderRight: "2px solid #00d9ff", overflowY: "auto" as const, zIndex: 5 };
const main = { marginLeft: 220, padding: "26px 28px 210px" };
const titleStyle = { fontSize: 48, margin: "0 0 18px" };
const input = { width: "100%", padding: 13, borderRadius: 14, border: "2px solid #00d9ff", background: "rgba(0,0,40,.58)", color: "white", marginBottom: 11, boxSizing: "border-box" as const };
const textarea = { ...input, height: 75 };
const filterRow = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const stats = { display: "flex", gap: 12, flexWrap: "wrap" as const, margin: "18px 0" };
const statBox = { width: 115, padding: 14, border: "2px solid #4de3ff", borderRadius: 18, background: "rgba(0,0,0,.38)" };
const uploadForm = { display: "grid", gap: 8, marginBottom: 24 };
const uploadBox = { padding: 17, border: "2px dashed #00d9ff", borderRadius: 18, background: "rgba(0,0,0,.32)", display: "grid", gap: 8 };
const previewImage = { width: "100%", height: 160, objectFit: "cover" as const, borderRadius: 15 };
const buttonRow = { display: "flex", gap: 9, flexWrap: "wrap" as const };
const recentRow = { display: "flex", gap: 15, overflowX: "auto" as const, marginBottom: 24 };
const recentCard = { minWidth: 185, borderRadius: 18, overflow: "hidden", background: "rgba(0,0,0,.36)", border: "2px solid #00d9ff", cursor: "pointer" };
const recentImage = { width: "100%", height: 115, objectFit: "cover" as const };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(285px,1fr))", gap: 20 };
const compactGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 15 };
const card = { borderRadius: 23, overflow: "hidden", background: "rgba(0,0,50,.58)" };
const cover = { width: "100%", height: 205, objectFit: "cover" as const };
const compactCover = { width: "100%", height: 140, objectFit: "cover" as const };
const body = { padding: 16 };
const player = { position: "fixed" as const, left: 220, right: 0, bottom: 0, minHeight: 82, background: "rgba(0,0,40,.94)", borderTop: "2px solid #00d9ff", display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", overflowX: "auto" as const, zIndex: 20 };
const queuePanel = { position: "fixed" as const, right: 18, top: 18, width: 340, maxHeight: "80vh", overflowY: "auto" as const, background: "rgba(0,0,30,.96)", border: "2px solid #00d9ff", borderRadius: 22, padding: 16, zIndex: 50 };
const queueItem = { display: "flex", alignItems: "center", gap: 9, background: "rgba(255,255,255,.08)", borderRadius: 13, padding: 9, marginBottom: 9 };
const queueImage = { width: 48, height: 48, objectFit: "cover" as const, borderRadius: 10 };
const fullPlayer = { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.94)", zIndex: 100, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: 30 };
const fullCover = { width: 280, height: 280, objectFit: "cover" as const, borderRadius: 28, boxShadow: "0 0 50px #00d9ff" };
const fullVideo = { width: "75vw", maxHeight: "55vh", borderRadius: 24, boxShadow: "0 0 50px #00d9ff" };
const lyricsBox = { whiteSpace: "pre-wrap" as const, maxWidth: 650, maxHeight: 180, overflowY: "auto" as const, background: "rgba(255,255,255,.08)", padding: 18, borderRadius: 18 };
const sideButton = { width: "100%", padding: 10, marginBottom: 9, borderRadius: 11, border: "none", fontWeight: "bold", cursor: "pointer" };
const sideButtonAqua = { ...sideButton, background: "#9ffcff", color: "#111" };
const themeRow = { display: "flex", gap: 9, flexWrap: "wrap" as const };
const themeDot = { width: 28, height: 28, borderRadius: "50%", border: "2px solid white", cursor: "pointer" };
const blue = { background: "#2de2ff", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const green = { background: "#80ed99", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const yellow = { background: "#ffe600", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const red = { background: "#ff74b1", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const white = { background: "white", border: "none", padding: "10px 13px", borderRadius: 10, fontWeight: "bold", cursor: "pointer" };
const planBadge = { background: "#ffe600", color: "#111", padding: 10, borderRadius: 12, fontWeight: "bold", marginBottom: 12 };
const adBanner = { background: "linear-gradient(90deg,#ffe600,#ff74b1)", color: "#111", padding: 14, borderRadius: 16, fontWeight: "bold", marginBottom: 18 };
const mediaTag = { position: "absolute" as const, top: 10, left: 10, background: "#ffe600", color: "#111", padding: "6px 10px", borderRadius: 10, fontWeight: "bold", fontSize: 12 };
const sponsorTag = { position: "absolute" as const, top: 10, right: 10, background: "#ff74b1", color: "#111", padding: "6px 10px", borderRadius: 10, fontWeight: "bold", fontSize: 12 };
const modal = { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.85)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 };
const pricingBox = { width: "min(900px,95vw)", background: "#06122f", border: "2px solid #00d9ff", borderRadius: 24, padding: 24 };
const pricingGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginBottom: 20 };
const priceCard = { background: "rgba(255,255,255,.08)", padding: 18, borderRadius: 18, border: "1px solid #00d9ff" };
const priceCardPremium = { ...priceCard, border: "2px solid #ffe600", boxShadow: "0 0 25px rgba(255,230,0,.5)" };