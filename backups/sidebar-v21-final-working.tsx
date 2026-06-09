type SidebarProps = {
  tracks: number
  likes: number
  plays: number
  queue: number
  darkMode: boolean
  toggleTheme: () => void
  recording: boolean
  recordingTime: number
  startRecording: () => void
}

export default function Sidebar({
  tracks,
  likes,
  plays,
  queue,
  darkMode,
  toggleTheme,
  recording,
  recordingTime,
  startRecording
}: SidebarProps) {
  const sidebarStyle = {
    width: 220,
    background: darkMode
      ? "linear-gradient(180deg,#000428,#004e92)"
      : "linear-gradient(180deg,#021B79,#0575E6)",
    padding: 20,
    color: "white",
    position: "fixed" as const,
    left: 0,
    top: 0,
    bottom: 0,
    overflowY: "auto" as const,
    borderRight: "2px solid #00d4ff",
    zIndex: 20
  }

  const buttonStyle = {
    width: "100%",
    padding: "16px",
    borderRadius: 16,
    border: "none",
    marginBottom: 14,
    cursor: "pointer",
    fontWeight: "bold" as const,
    fontSize: 18
  }

  return (
    <div style={sidebarStyle}>
      <h1
        style={{
          fontSize: 64,
          lineHeight: 1.05,
          marginBottom: 40
        }}
      >
        Z Music
        <br />
        V21
      </h1>

      <button
        onClick={toggleTheme}
        style={{
          ...buttonStyle,
          background: "#8be9e8",
          color: "black"
        }}
      >
        Toggle Theme
      </button>

      <button
        onClick={startRecording}
        style={{
          ...buttonStyle,
          background: recording ? "#ff4d6d" : "#8cff66",
          color: "black"
        }}
      >
        {recording ? "Stop Recording" : "Start Recording"}
      </button>

      <div
        style={{
          background: "#001f1f",
          padding: 16,
          borderRadius: 18,
          marginBottom: 24,
          border: "1px solid #00ffaa"
        }}
      >
        <div style={{ fontSize: 18 }}>
          🟢 {recording ? "RECORDING" : "READY"}
        </div>

        <div style={{ marginTop: 8 }}>
          ⏱ {recordingTime}s
        </div>
      </div>

      <div
        style={{
          fontSize: 24,
          fontWeight: "bold",
          marginBottom: 20
        }}
      >
        Creator Studio
      </div>

      <div style={{ marginBottom: 14 }}>
        🎵 Tracks: {tracks}
      </div>

      <div style={{ marginBottom: 14 }}>
        ❤️ Likes: {likes}
      </div>

      <div style={{ marginBottom: 14 }}>
        🔥 Plays: {plays}
      </div>

      <div style={{ marginBottom: 30 }}>
        🎧 Queue: {queue}
      </div>
    </div>
  )
}
