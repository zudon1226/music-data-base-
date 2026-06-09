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
type Playlist = {
    id: string;
    name: string;
    tracks: string[];
};
export default function Page() {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [tracks, setTracks] = useState<Track[]>([]);
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [queue, setQueue] = useState<Track[]>([]);
    const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
    const [search, setSearch] = useState("");
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [shuffle, setShuffle] = useState(false);
    const [repeat, setRepeat] = useState(false);
    const [muted, setMuted] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState("");
    useEffect(() => {
        const savedTracks = localStorage.getItem("zmusic-tracks");
        const savedQueue = localStorage.getItem("zmusic-queue");
        const savedRecent = localStorage.getItem("zmusic-recent");
        const savedPlaylists = localStorage.getItem("zmusic-playlists");
        if (savedTracks)
            setTracks(JSON.parse(savedTracks));
        if (savedQueue)
            setQueue(JSON.parse(savedQueue));
        if (savedRecent)
            setRecentlyPlayed(JSON.parse(savedRecent));
        if (savedPlaylists)
            setPlaylists(JSON.parse(savedPlaylists));
    }, []);
    useEffect(() => {
        localStorage.setItem("zmusic-tracks", JSON.stringify(tracks));
    }, [tracks]);
    useEffect(() => {
        localStorage.setItem("zmusic-queue", JSON.stringify(queue));
    }, [queue]);
    useEffect(() => {
        localStorage.setItem("zmusic-recent", JSON.stringify(recentlyPlayed));
    }, [recentlyPlayed]);
    useEffect(() => {
        localStorage.setItem("zmusic-playlists", JSON.stringify(playlists));
    }, [playlists]);
    useEffect(() => {
        if (!audioRef.current)
            return;
        audioRef.current.volume = volume;
        audioRef.current.muted = muted;
        const update = () => {
            if (!audioRef.current)
                return;
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
            audioRef.current?.removeEventListener("timeupdate", update);
            audioRef.current?.removeEventListener("ended", ended);
        };
    }, [repeat, currentTrack, volume, muted]);
    const formatTime = (time: number) => {
        if (!time || isNaN(time))
            return "0:00";
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs
            .toString()
            .padStart(2, "0")}`;
    };
    const uploadTracks = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files)
            return;
        const newTracks: Track[] = Array.from(files).map((file, index) => ({
            id: `${Date.now()}-${index}-${Math.random()}`,
            title: file.name
                .replace(/\.[^/.]+$/, "")
                .replace(/_/g, " "),
            artist: "Uploaded Media",
            url: URL.createObjectURL(file),
            image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d",
            likes: 0,
            plays: 0,
        }));
        setTracks((prev) => [...prev, ...newTracks]);
    };
    const playTrack = async (track: Track) => {
        if (!audioRef.current)
            return;
        try {
            audioRef.current.src = track.url;
            await audioRef.current.play();
            setCurrentTrack(track);
            setIsPlaying(true);
            setTracks((prev) => prev.map((t) => t.id === track.id
                ? {
                    ...t,
                    plays: t.plays + 1,
                }
                : t));
            setRecentlyPlayed((prev) => {
                const filtered = prev.filter((t) => t.id !== track.id);
                return [track, ...filtered].slice(0, 10);
            });
        }
        catch (err) {
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
        }
        catch (err) {
        }
    };
    const playNext = () => {
        if (!tracks.length)
            return;
        if (shuffle) {
            const random = tracks[Math.floor(Math.random() * tracks.length)];
            playTrack(random);
            return;
        }
        if (!currentTrack) {
            playTrack(tracks[0]);
            return;
        }
        const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
        const nextIndex = currentIndex + 1 >= tracks.length
            ? 0
            : currentIndex + 1;
        playTrack(tracks[nextIndex]);
    };
    const playPrev = () => {
        if (!tracks.length)
            return;
        if (!currentTrack) {
            playTrack(tracks[0]);
            return;
        }
        const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
        const prevIndex = currentIndex - 1 < 0
            ? tracks.length - 1
            : currentIndex - 1;
        playTrack(tracks[prevIndex]);
    };
    const likeTrack = (track: Track) => {
        setTracks((prev) => prev.map((t) => t.id === track.id
            ? {
                ...t,
                likes: t.likes + 1,
            }
            : t));
    };
    const addToQueue = (track: Track) => {
        setQueue((prev) => {
            if (prev.some((t) => t.id === track.id)) {
                return prev;
            }
            return [...prev, track];
        });
    };
    const clearQueue = () => {
        setQueue([]);
    };
    const deleteTrack = (track: Track) => {
        setTracks((prev) => prev.filter((t) => t.id !== track.id));
        setQueue((prev) => prev.filter((t) => t.id !== track.id));
        setRecentlyPlayed((prev) => prev.filter((t) => t.id !== track.id));
        if (currentTrack?.id === track.id) {
            pauseTrack();
            setCurrentTrack(null);
        }
    };
    const createPlaylist = () => {
        if (!newPlaylistName.trim())
            return;
        const playlist: Playlist = {
            id: `${Date.now()}`,
            name: newPlaylistName,
            tracks: [],
        };
        setPlaylists((prev) => [
            ...prev,
            playlist,
        ]);
        setNewPlaylistName("");
    };
    const addTrackToPlaylist = (playlistId: string, trackId: string) => {
        setPlaylists((prev) => prev.map((playlist) => playlist.id === playlistId
            ? {
                ...playlist,
                tracks: [
                    ...playlist.tracks,
                    trackId,
                ],
            }
            : playlist));
    };
    const filteredTracks = tracks.filter((track) => track.title
        .toLowerCase()
        .includes(search.toLowerCase()));
    return (<main style={{
            minHeight: "100vh",
            padding: "20px",
            background: "linear-gradient(180deg,#0917a8,#050b52)",
            color: "white",
            fontFamily: "Arial",
        }}>
      <audio ref={audioRef}/>

      <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
        }}>
        <h1 style={{
            fontSize: "64px",
            textShadow: "0 0 20px #00d9ff",
        }}>
          Z Music V39
        </h1>

        <label style={{
            background: "#9cff2e",
            color: "black",
            padding: "18px 26px",
            borderRadius: "18px",
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 0 20px #9cff2e",
        }}>
          ⬆ Upload Media

          <input type="file" multiple accept="audio/*" hidden onChange={uploadTracks}/>
        </label>
      </div>

      <input placeholder="Search music..." value={search} onChange={(e) => setSearch(e.target.value)} style={{
            width: "100%",
            padding: "22px",
            borderRadius: "20px",
            border: "2px solid #00d9ff",
            background: "#1321c7",
            color: "white",
            fontSize: "28px",
            marginBottom: "20px",
            boxShadow: "0 0 18px #00d9ff",
        }}/>

      <div style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: "20px",
        }}>
        <div>
          <SidebarCard title="Library">
            <p>🎵 {tracks.length} Tracks</p>

            <p>
              ❤️{" "}
              {tracks.reduce((a, b) => a + b.likes, 0)}{" "}
              Likes
            </p>

            <p>
              🔥{" "}
              {tracks.reduce((a, b) => a + b.plays, 0)}{" "}
              Plays
            </p>
          </SidebarCard>

          <SidebarCard title="Queue">
            <button onClick={clearQueue} style={{
            marginBottom: "10px",
            padding: "10px",
            borderRadius: "12px",
            border: "none",
            background: "#ff2ea6",
            color: "white",
            cursor: "pointer",
        }}>
              Clear Queue
            </button>

            {queue.length === 0 && (<p>No Tracks Queued</p>)}

            {queue.map((track) => (<MiniTrack key={track.id} title={track.title}/>))}
          </SidebarCard>

          <SidebarCard title="Recently Played">
            {recentlyPlayed.length ===
            0 && (<p>No Recent Tracks</p>)}

            {recentlyPlayed.map((track) => (<MiniTrack key={track.id} title={track.title}/>))}
          </SidebarCard>

          <SidebarCard title="Playlists">
            <input value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} placeholder="New playlist..." style={{
            width: "100%",
            padding: "10px",
            borderRadius: "12px",
            border: "none",
            marginBottom: "10px",
        }}/>

            <button onClick={createPlaylist} style={{
            width: "100%",
            padding: "12px",
            borderRadius: "12px",
            border: "none",
            background: "#00d9ff",
            color: "black",
            fontWeight: "bold",
            cursor: "pointer",
            marginBottom: "12px",
        }}>
              Create Playlist
            </button>

            {playlists.map((playlist) => (<div key={playlist.id} style={{
                background: "#1b2be6",
                padding: "12px",
                borderRadius: "12px",
                marginBottom: "10px",
            }}>
                🎵 {playlist.name}
              </div>))}
          </SidebarCard>
        </div>

        <div>
          {filteredTracks.map((track) => (<div key={track.id} style={{
                background: "#1321c7",
                borderRadius: "28px",
                overflow: "hidden",
                marginBottom: "24px",
                boxShadow: "0 0 24px #00d9ff",
            }}>
              <img src={track.image} style={{
                width: "100%",
                height: "320px",
                objectFit: "cover",
            }}/>

              <div style={{ padding: "24px" }}>
                <h2 style={{
                fontSize: "44px",
                marginBottom: "14px",
            }}>
                  {track.title}
                </h2>

                <p style={{
                fontSize: "24px",
            }}>
                  🔥 {track.plays}
                  {"  "} ❤️ {track.likes}
                  {"  "} 🎵 {track.artist}
                </p>

                <div style={{
                display: "flex",
                gap: "14px",
                flexWrap: "wrap",
                marginTop: "20px",
            }}>
                  <ActionButton text="▶ Play" color="#00d9ff" onClick={() => playTrack(track)}/>

                  <ActionButton text="⏸ Pause" color="#9cff2e" onClick={pauseTrack}/>

                  <ActionButton text="❤️ Like" color="#ff2ea6" onClick={() => likeTrack(track)}/>

                  <ActionButton text="➕ Queue" color="#ffd000" onClick={() => addToQueue(track)}/>

                  <ActionButton text="🗑 Delete" color="#ff6f91" onClick={() => deleteTrack(track)}/>

                  {playlists.map((playlist) => (<ActionButton key={playlist.id} text={`➕ ${playlist.name}`} color="#7dffef" onClick={() => addTrackToPlaylist(playlist.id, track.id)}/>))}
                </div>
              </div>
            </div>))}
        </div>
      </div>

      <div style={{
            position: "fixed",
            bottom: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "700px",
            maxWidth: "94%",
            background: "black",
            borderRadius: "30px",
            padding: "24px",
            boxShadow: "0 0 30px #00d9ff",
        }}>
        <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "18px",
            fontSize: "28px",
            fontWeight: "bold",
        }}>
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

        <div style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "6px",
            height: "90px",
            marginBottom: "18px",
        }}>
          {Array.from({
            length: 24,
        }).map((_, i) => (<div key={i} style={{
                width: "18px",
                height: isPlaying
                    ? `${25 +
                        Math.random() *
                            55}px`
                    : "18px",
                background: "linear-gradient(#9cff2e,#00d9ff)",
                borderRadius: "10px",
                transition: "0.2s",
            }}/>))}
        </div>

        <input type="range" min={0} max={duration || 0} value={currentTime} onChange={(e) => {
            if (!audioRef.current)
                return;
            audioRef.current.currentTime =
                Number(e.target.value);
            setCurrentTime(Number(e.target.value));
        }} style={{
            width: "100%",
            marginBottom: "20px",
        }}/>

        <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
        }}>
          <div style={{
            display: "flex",
            gap: "10px",
        }}>
            <PlayerButton text="⏮" color="#00d9ff" onClick={playPrev}/>

            {!isPlaying ? (<PlayerButton text="▶" color="#9cff2e" onClick={resumeTrack}/>) : (<PlayerButton text="⏸" color="#9cff2e" onClick={pauseTrack}/>)}

            <PlayerButton text="⏭" color="#00d9ff" onClick={playNext}/>
          </div>

          <div style={{
            display: "flex",
            gap: "10px",
        }}>
            <PlayerButton text="Shuffle" color={shuffle
            ? "#ffd000"
            : "#444"} onClick={() => setShuffle(!shuffle)}/>

            <PlayerButton text="Repeat" color={repeat
            ? "#ff2ea6"
            : "#444"} onClick={() => setRepeat(!repeat)}/>

            <PlayerButton text={muted
            ? "🔇"
            : "🔊"} color="#7dffef" onClick={() => setMuted(!muted)}/>
          </div>

          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{
            width: "120px",
        }}/>
        </div>
      </div>
    </main>);
}
function SidebarCard({ title, children, }: {
    title: string;
    children: React.ReactNode;
}) {
    return (<div style={{
            background: "#1321c7",
            borderRadius: "24px",
            padding: "20px",
            marginBottom: "20px",
            boxShadow: "0 0 20px #00d9ff",
        }}>
      <h2 style={{
            marginBottom: "16px",
            fontSize: "22px",
        }}>
        {title}
      </h2>

      {children}
    </div>);
}
function MiniTrack({ title, }: {
    title: string;
}) {
    return (<div style={{
            background: "#1b2be6",
            padding: "12px",
            borderRadius: "12px",
            marginBottom: "10px",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
        }}>
      🎵 {title}
    </div>);
}
function ActionButton({ text, color, onClick, }: {
    text: string;
    color: string;
    onClick: () => void;
}) {
    return (<button onClick={onClick} style={{
            background: color,
            color: "black",
            border: "none",
            padding: "16px 22px",
            borderRadius: "18px",
            fontWeight: "bold",
            fontSize: "22px",
            cursor: "pointer",
            boxShadow: `0 0 18px ${color}`,
        }}>
      {text}
    </button>);
}
function PlayerButton({ text, color, onClick, }: {
    text: string;
    color: string;
    onClick: () => void;
}) {
    return (<button onClick={onClick} style={{
            background: color,
            color: "black",
            border: "none",
            padding: "14px 20px",
            borderRadius: "18px",
            fontWeight: "bold",
            fontSize: "22px",
            cursor: "pointer",
            boxShadow: `0 0 18px ${color}`,
        }}>
      {text}
    </button>);
}
