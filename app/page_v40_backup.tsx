"use client";
import { useEffect, useRef, useState } from "react";
type Track = {
    id: string;
    title: string;
    url: string;
    plays: number;
    likes: number;
};
export default function Home() {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [tracks, setTracks] = useState<Track[]>([]);
    const [queue, setQueue] = useState<Track[]>([]);
    const [recent, setRecent] = useState<Track[]>([]);
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [search, setSearch] = useState("");
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [shuffle, setShuffle] = useState(false);
    const [repeat, setRepeat] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [playerPosition, setPlayerPosition] = useState({
        x: 450,
        y: 500,
    });
    useEffect(() => {
        const savedTracks = localStorage.getItem("zmusic-v40-tracks");
        const savedRecent = localStorage.getItem("zmusic-v40-recent");
        const savedQueue = localStorage.getItem("zmusic-v40-queue");
        if (savedTracks)
            setTracks(JSON.parse(savedTracks));
        if (savedRecent)
            setRecent(JSON.parse(savedRecent));
        if (savedQueue)
            setQueue(JSON.parse(savedQueue));
    }, []);
    useEffect(() => {
        localStorage.setItem("zmusic-v40-tracks", JSON.stringify(tracks));
    }, [tracks]);
    useEffect(() => {
        localStorage.setItem("zmusic-v40-recent", JSON.stringify(recent));
    }, [recent]);
    useEffect(() => {
        localStorage.setItem("zmusic-v40-queue", JSON.stringify(queue));
    }, [queue]);
    useEffect(() => {
        const move = (e: MouseEvent) => {
            if (!dragging)
                return;
            setPlayerPosition({
                x: e.clientX - 300,
                y: e.clientY - 120,
            });
        };
        const up = () => setDragging(false);
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        return () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };
    }, [dragging]);
    const uploadFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files)
            return;
        const uploaded: Track[] = [];
        Array.from(files).forEach((file) => {
            uploaded.push({
                id: crypto.randomUUID(),
                title: file.name,
                url: URL.createObjectURL(file),
                likes: 0,
                plays: 0,
            });
        });
        setTracks((prev) => [...prev, ...uploaded]);
    };
    const playTrack = async (track: Track) => {
        if (!audioRef.current)
            return;
        audioRef.current.src = track.url;
        try {
            await audioRef.current.play();
            setCurrentTrack(track);
            setIsPlaying(true);
            const updated = tracks.map((t) => t.id === track.id
                ? { ...t, plays: t.plays + 1 }
                : t);
            setTracks(updated);
            setRecent((prev) => {
                const filtered = prev.filter((p) => p.id !== track.id);
                return [track, ...filtered].slice(0, 5);
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
    const nextTrack = () => {
        if (!tracks.length)
            return;
        if (shuffle) {
            const random = tracks[Math.floor(Math.random() * tracks.length)];
            playTrack(random);
            return;
        }
        if (!currentTrack)
            return;
        const index = tracks.findIndex((t) => t.id === currentTrack.id);
        const next = tracks[(index + 1) % tracks.length];
        playTrack(next);
    };
    const previousTrack = () => {
        if (!tracks.length)
            return;
        if (!currentTrack)
            return;
        const index = tracks.findIndex((t) => t.id === currentTrack.id);
        const previous = tracks[(index - 1 + tracks.length) % tracks.length];
        playTrack(previous);
    };
    const addToQueue = (track: Track) => {
        const exists = queue.some((q) => q.id === track.id);
        if (exists)
            return;
        setQueue((prev) => [...prev, track]);
    };
    const clearQueue = () => {
        setQueue([]);
    };
    const deleteTrack = (id: string) => {
        setTracks((prev) => prev.filter((t) => t.id !== id));
        setQueue((prev) => prev.filter((t) => t.id !== id));
        setRecent((prev) => prev.filter((t) => t.id !== id));
        if (currentTrack?.id === id) {
            pauseTrack();
            setCurrentTrack(null);
        }
    };
    const likeTrack = (id: string) => {
        setTracks((prev) => prev.map((t) => t.id === id
            ? { ...t, likes: t.likes + 1 }
            : t));
    };
    const filteredTracks = tracks.filter((track) => track.title.toLowerCase().includes(search.toLowerCase()));
    return (<main style={{
            minHeight: "100vh",
            background: "#0618b5",
            color: "white",
            padding: 20,
            fontFamily: "Arial",
        }}>
      <audio ref={audioRef} onTimeUpdate={() => {
            if (!audioRef.current)
                return;
            setProgress(audioRef.current.currentTime);
            setDuration(audioRef.current.duration || 0);
        }} onEnded={() => {
            if (repeat && currentTrack) {
                playTrack(currentTrack);
            }
            else {
                nextTrack();
            }
        }}/>

      <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 30,
        }}>
        <h1 style={{
            fontSize: 64,
            margin: 0,
        }}>
          Z Music V40
        </h1>

        <label style={{
            background: "#8dff29",
            color: "black",
            padding: "18px 28px",
            borderRadius: 18,
            fontWeight: "bold",
            cursor: "pointer",
            boxShadow: "0 0 25px #8dff29",
        }}>
          ⬆ Upload Media

          <input type="file" multiple accept="audio/*" onChange={uploadFiles} hidden/>
        </label>
      </div>

      <input placeholder="Search music..." value={search} onChange={(e) => setSearch(e.target.value)} style={{
            width: "100%",
            padding: 24,
            fontSize: 36,
            borderRadius: 20,
            marginBottom: 25,
            background: "#2326d7",
            color: "white",
            border: "2px solid #00e5ff",
            boxShadow: "0 0 25px #00e5ff",
        }}/>

      <div style={{
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            gap: 25,
        }}>
        <div>
          <Panel title="Library">
            <Stat>🎵 {tracks.length} Tracks</Stat>
            <Stat>
              ❤️{" "}
              {tracks.reduce((a, b) => a + b.likes, 0)}{" "}
              Likes
            </Stat>
            <Stat>
              🔥{" "}
              {tracks.reduce((a, b) => a + b.plays, 0)}{" "}
              Plays
            </Stat>
          </Panel>

          <Panel title="Queue">
            <button onClick={clearQueue} style={smallButton("#ff2ea6")}>
              Clear Queue
            </button>

            {queue.length === 0 && (<p>No Tracks Queued</p>)}

            {queue.map((track) => (<MiniTrack key={track.id} title={track.title}/>))}
          </Panel>

          <Panel title="Recently Played">
            {recent.length === 0 && (<p>No Recent Tracks</p>)}

            {recent.map((track) => (<MiniTrack key={track.id} title={track.title}/>))}
          </Panel>
        </div>

        <div>
          <div style={{
            borderRadius: 28,
            overflow: "hidden",
            boxShadow: "0 0 30px #00e5ff",
            marginBottom: 25,
        }}>
            <img src="https://images.unsplash.com/photo-1511379938547-c1f69419868d" style={{
            width: "100%",
            height: 320,
            objectFit: "cover",
        }}/>
          </div>

          {filteredTracks.map((track) => (<div key={track.id} style={{
                background: "#1f22d0",
                borderRadius: 28,
                padding: 30,
                marginBottom: 20,
                boxShadow: "0 0 25px #00e5ff",
            }}>
              <h2 style={{
                fontSize: 54,
                marginBottom: 15,
            }}>
                {track.title}
              </h2>

              <div style={{
                display: "flex",
                gap: 20,
                marginBottom: 25,
                fontSize: 30,
            }}>
                <span>🔥 {track.plays}</span>
                <span>❤️ {track.likes}</span>
                <span>🎵 Uploaded Media</span>
              </div>

              <div style={{
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
            }}>
                <button onClick={() => playTrack(track)} style={actionButton("#14dfff")}>
                  ▶ Play
                </button>

                <button onClick={pauseTrack} style={actionButton("#8dff29")}>
                  ⏸ Pause
                </button>

                <button onClick={() => likeTrack(track.id)} style={actionButton("#ff2ea6")}>
                  ❤️ Like
                </button>

                <button onClick={() => addToQueue(track)} style={actionButton("#ffc400")}>
                  ➕ Queue
                </button>

                <button onClick={() => deleteTrack(track.id)} style={actionButton("#ff6b91")}>
                  🗑 Delete
                </button>
              </div>
            </div>))}
        </div>
      </div>

      <div onMouseDown={() => setDragging(true)} style={{
            position: "fixed",
            left: playerPosition.x,
            top: playerPosition.y,
            width: 650,
            background: "black",
            borderRadius: 30,
            padding: 25,
            boxShadow: "0 0 35px #00e5ff",
            zIndex: 999,
            cursor: "move",
        }}>
        <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 20,
            fontSize: 24,
            fontWeight: "bold",
        }}>
          <span>
            {currentTrack
            ? currentTrack.title
            : "No Track Playing"}
          </span>

          <span>
            {Math.floor(progress)} /
            {Math.floor(duration)}
          </span>
        </div>

        <div style={{
            display: "flex",
            gap: 8,
            marginBottom: 20,
        }}>
          {Array.from({ length: 24 }).map((_, i) => (<div key={i} style={{
                width: 18,
                height: isPlaying
                    ? Math.random() * 80 + 20
                    : 20,
                borderRadius: 12,
                background: "linear-gradient(to top,#00e5ff,#a6ff00)",
                transition: "0.2s",
            }}/>))}
        </div>

        <input type="range" min={0} max={duration || 0} value={progress} onChange={(e) => {
            if (!audioRef.current)
                return;
            audioRef.current.currentTime =
                Number(e.target.value);
        }} style={{
            width: "100%",
            marginBottom: 25,
        }}/>

        <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
        }}>
          <div style={{
            display: "flex",
            gap: 15,
        }}>
            <button onClick={previousTrack} style={playerButton("#14dfff")}>
              ⏮
            </button>

            <button onClick={() => isPlaying
            ? pauseTrack()
            : resumeTrack()} style={playerButton("#8dff29")}>
              {isPlaying ? "⏸" : "▶"}
            </button>

            <button onClick={nextTrack} style={playerButton("#14dfff")}>
              ⏭
            </button>
          </div>

          <div style={{
            display: "flex",
            gap: 12,
        }}>
            <button onClick={() => setShuffle(!shuffle)} style={darkButton}>
              Shuffle
            </button>

            <button onClick={() => setRepeat(!repeat)} style={darkButton}>
              Repeat
            </button>
          </div>

          <input type="range" min={0} max={1} step={0.1} value={volume} onChange={(e) => {
            const value = Number(e.target.value);
            setVolume(value);
            if (audioRef.current) {
                audioRef.current.volume =
                    value;
            }
        }}/>
        </div>
      </div>
    </main>);
}
function Panel({ title, children, }: {
    title: string;
    children: React.ReactNode;
}) {
    return (<div style={{
            background: "#1f22d0",
            borderRadius: 28,
            padding: 20,
            marginBottom: 20,
            boxShadow: "0 0 25px #00e5ff",
        }}>
      <h2 style={{
            fontSize: 28,
            marginBottom: 15,
        }}>
        {title}
      </h2>

      {children}
    </div>);
}
function Stat({ children, }: {
    children: React.ReactNode;
}) {
    return (<div style={{
            marginBottom: 12,
            fontSize: 24,
        }}>
      {children}
    </div>);
}
function MiniTrack({ title, }: {
    title: string;
}) {
    return (<div style={{
            background: "#2c31e0",
            padding: 12,
            borderRadius: 16,
            marginBottom: 10,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
        }}>
      🎵 {title}
    </div>);
}
const actionButton = (color: string): React.CSSProperties => ({
    background: color,
    border: "none",
    color: "black",
    padding: "16px 26px",
    borderRadius: 18,
    fontSize: 28,
    fontWeight: "bold",
    cursor: "pointer",
    boxShadow: `0 0 18px ${color}`,
});
const playerButton = (color: string): React.CSSProperties => ({
    background: color,
    border: "none",
    width: 72,
    height: 72,
    borderRadius: 20,
    fontSize: 34,
    cursor: "pointer",
    boxShadow: `0 0 18px ${color}`,
});
const darkButton: React.CSSProperties = {
    background: "#303030",
    color: "white",
    border: "none",
    padding: "14px 24px",
    borderRadius: 18,
    fontSize: 26,
    cursor: "pointer",
};
const smallButton = (color: string): React.CSSProperties => ({
    background: color,
    border: "none",
    color: "white",
    padding: "10px 16px",
    borderRadius: 14,
    marginBottom: 15,
    cursor: "pointer",
});
