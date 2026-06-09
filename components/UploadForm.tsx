import type { CSSProperties, FormEvent } from "react"

type UploadFormProps = {
  artist: string
  setArtist: (value: string) => void

  title: string
  setTitle: (value: string) => void

  producer: string
  setProducer: (value: string) => void

  genre: string
  setGenre: (value: string) => void

  cover: string
  setCover: (value: string) => void

  inputStyle: CSSProperties
  uploadBox: CSSProperties

  uploadTrack: (event: FormEvent<HTMLFormElement>) => void
}

export default function UploadForm({
  artist,
  setArtist,
  title,
  setTitle,
  producer,
  setProducer,
  genre,
  setGenre,
  cover,
  setCover,
  inputStyle,
  uploadBox,
  uploadTrack,
}: UploadFormProps) {
  return (
    <div style={uploadBox}>
      <h2 style={{ fontSize: 40 }}>Upload MP3</h2>

      <form onSubmit={uploadTrack}>
        <input
          name="artist"
          placeholder="Artist"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          style={inputStyle}
        />

        <input
          name="title"
          placeholder="Song Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />

        <input
          name="producer"
          placeholder="Producer"
          value={producer}
          onChange={(e) => setProducer(e.target.value)}
          style={inputStyle}
        />

        <input
          name="genre"
          placeholder="Genre"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          style={inputStyle}
        />

        <input
          name="cover"
          placeholder="Cover URL"
          value={cover}
          onChange={(e) => setCover(e.target.value)}
          style={inputStyle}
        />

        <input
          type="file"
          name="audio"
          accept=".mp3,audio/*"
          style={{ marginBottom: 20 }}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: 20,
            borderRadius: 20,
            border: "none",
            background: "#7cff4f",
            color: "black",
            fontWeight: "bold",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          Upload Track
        </button>
      </form>
    </div>
  )
}
