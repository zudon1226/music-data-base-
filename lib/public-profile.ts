import { getSupabaseServerClient, safeSelect } from "@/lib/server-supabase";

export type PublicMediaItem = {
  id: string;
  title: string;
  creator: string;
  coverUrl: string;
  category: string;
  metricLabel: string;
  createdAt: string;
};

export type PublicProfile = {
  id: string;
  userId: string;
  name: string;
  type: "artist" | "producer";
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  website: string;
  verified: boolean;
  followers: number;
  monthlyListeners: number;
  songs: PublicMediaItem[];
  videos: PublicMediaItem[];
  albums: PublicMediaItem[];
  beats: PublicMediaItem[];
};

const DEFAULT_IMAGE = "/music-data-base-logo.png";
const PROFILE_SELECT = "id,user_id,artist_key,name,avatar_url,banner_url,bio,social_links,website,monthly_listeners,followers,verified,created_at";
const PRODUCER_SELECT = "id,user_id,name,avatar_url,banner_url,bio,tagline,website,followers,verified,created_at";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function matchesIdentifier(identifier: string, ...values: unknown[]) {
  const cleanIdentifier = identifier.trim().toLowerCase();
  const slugIdentifier = slugify(identifier);

  return values.some((value) => {
    const cleanValue = getString(value).toLowerCase();
    return cleanValue === cleanIdentifier || slugify(cleanValue) === slugIdentifier;
  });
}

function hasCreatorMatch(row: Record<string, unknown>, profile: PublicProfile) {
  return matchesIdentifier(
    profile.id,
    row.artist_id,
    row.producer_id,
    row.producer_profile_id,
    row.user_id,
    profile.userId,
  ) || matchesIdentifier(
    profile.name,
    row.artist,
    row.artist_name,
    row.producer,
    row.producer_name,
    row.creator_name,
  );
}

function mapSong(row: Record<string, unknown>): PublicMediaItem {
  return {
    id: getString(row.id),
    title: getString(row.title) || "Untitled song",
    creator: getString(row.artist) || getString(row.creator_name) || "Unknown artist",
    coverUrl: getString(row.cover_url) || getString(row.avatar_url) || DEFAULT_IMAGE,
    category: getString(row.category) || getString(row.type) || "Song",
    metricLabel: `${getNumber(row.plays).toLocaleString()} plays`,
    createdAt: getString(row.created_at),
  };
}

function mapVideo(row: Record<string, unknown>): PublicMediaItem {
  return {
    id: getString(row.id),
    title: getString(row.title) || "Untitled video",
    creator: getString(row.artist_name) || getString(row.producer_name) || "Unknown creator",
    coverUrl: getString(row.cover_url) || getString(row.thumbnail_url) || DEFAULT_IMAGE,
    category: getString(row.category) || "Video",
    metricLabel: `${getNumber(row.views).toLocaleString()} views`,
    createdAt: getString(row.created_at),
  };
}

function mapAlbum(row: Record<string, unknown>): PublicMediaItem {
  return {
    id: getString(row.id),
    title: getString(row.title) || "Untitled album",
    creator: getString(row.creator_name) || getString(row.artist_name) || getString(row.producer_name) || "Unknown creator",
    coverUrl: getString(row.cover_url) || DEFAULT_IMAGE,
    category: getString(row.category) || "Album",
    metricLabel: "Album",
    createdAt: getString(row.release_date) || getString(row.created_at),
  };
}

function mapBeat(row: Record<string, unknown>): PublicMediaItem {
  return {
    id: getString(row.id),
    title: getString(row.title) || "Untitled beat",
    creator: getString(row.producer_name) || "Unknown producer",
    coverUrl: getString(row.cover_url) || DEFAULT_IMAGE,
    category: getString(row.category) || getString(row.license) || "Beat",
    metricLabel: `${getNumber(row.plays).toLocaleString()} plays`,
    createdAt: getString(row.created_at),
  };
}

function createArtistProfile(row: Record<string, unknown>, identifier: string): PublicProfile {
  const name = getString(row.name) || getString(row.artist) || getString(row.artist_name) || identifier;

  return {
    id: getString(row.id) || slugify(name),
    userId: getString(row.user_id) || getString(row.artist_id),
    name,
    type: "artist",
    avatarUrl: getString(row.avatar_url) || getString(row.cover_url) || DEFAULT_IMAGE,
    bannerUrl: getString(row.banner_url) || getString(row.cover_url) || DEFAULT_IMAGE,
    bio: getString(row.bio) || `${name} on Music Data Base.`,
    website: getString(row.website),
    verified: Boolean(row.verified),
    followers: getNumber(row.followers),
    monthlyListeners: getNumber(row.monthly_listeners),
    songs: [],
    videos: [],
    albums: [],
    beats: [],
  };
}

function createProducerProfile(row: Record<string, unknown>, identifier: string): PublicProfile {
  const name = getString(row.name) || getString(row.producer_name) || identifier;

  return {
    id: getString(row.id) || slugify(name),
    userId: getString(row.user_id) || getString(row.producer_user_id),
    name,
    type: "producer",
    avatarUrl: getString(row.avatar_url) || getString(row.cover_url) || DEFAULT_IMAGE,
    bannerUrl: getString(row.banner_url) || getString(row.cover_url) || DEFAULT_IMAGE,
    bio: getString(row.bio) || getString(row.tagline) || `${name} on Music Data Base.`,
    website: getString(row.website),
    verified: Boolean(row.verified),
    followers: getNumber(row.followers),
    monthlyListeners: 0,
    songs: [],
    videos: [],
    albums: [],
    beats: [],
  };
}

function sortRecent(items: PublicMediaItem[]) {
  return [...items].sort((a, b) => Date.parse(b.createdAt || "0") - Date.parse(a.createdAt || "0"));
}

export async function loadPublicArtistProfile(identifier: string) {
  const supabase = getSupabaseServerClient();
  const [profiles, songs, videos, albums] = await Promise.all([
    safeSelect<Record<string, unknown>>(supabase.from("artist_profiles").select(PROFILE_SELECT).limit(1000)),
    safeSelect<Record<string, unknown>>(supabase.from("songs").select("id,user_id,title,artist,category,type,cover_url,avatar_url,plays,likes,created_at").limit(1000)),
    safeSelect<Record<string, unknown>>(supabase.from("videos").select("id,user_id,title,artist_name,artist_id,category,cover_url,thumbnail_url,views,likes,created_at").limit(1000)),
    safeSelect<Record<string, unknown>>(supabase.from("albums").select("id,user_id,title,creator_name,artist_name,artist_id,owner_type,cover_url,category,release_date,created_at").limit(1000)),
  ]);

  const profileRow = profiles.find((profile) => matchesIdentifier(
    identifier,
    profile.id,
    profile.user_id,
    profile.artist_key,
    profile.name,
  ));

  const inferredRow = profileRow || songs.find((song) => matchesIdentifier(identifier, song.user_id, song.artist)) ||
    videos.find((video) => matchesIdentifier(identifier, video.user_id, video.artist_id, video.artist_name)) ||
    albums.find((album) => matchesIdentifier(identifier, album.user_id, album.artist_id, album.artist_name, album.creator_name));

  if (!inferredRow) return null;

  const profile = createArtistProfile(inferredRow, identifier);
  profile.songs = sortRecent(songs.filter((song) => hasCreatorMatch(song, profile)).map(mapSong));
  profile.videos = sortRecent(videos.filter((video) => hasCreatorMatch(video, profile)).map(mapVideo));
  profile.albums = sortRecent(albums.filter((album) => hasCreatorMatch(album, profile)).map(mapAlbum));
  profile.monthlyListeners = profile.monthlyListeners || profile.songs.reduce((total, song) => total + Number.parseInt(song.metricLabel, 10), 0);

  return profile;
}

export async function loadPublicProducerProfile(identifier: string) {
  const supabase = getSupabaseServerClient();
  const [profiles, beats, songs, videos, albums] = await Promise.all([
    safeSelect<Record<string, unknown>>(supabase.from("producer_profiles").select(PRODUCER_SELECT).limit(1000)),
    safeSelect<Record<string, unknown>>(supabase.from("producer_beats").select("id,producer_id,producer_user_id,producer_name,title,category,cover_url,license,plays,likes,created_at").limit(1000)),
    safeSelect<Record<string, unknown>>(supabase.from("songs").select("id,user_id,title,artist,producer,producer_id,category,type,cover_url,avatar_url,plays,likes,created_at").limit(1000)),
    safeSelect<Record<string, unknown>>(supabase.from("videos").select("id,user_id,title,producer,producer_name,producer_id,producer_profile_id,category,cover_url,thumbnail_url,views,likes,created_at").limit(1000)),
    safeSelect<Record<string, unknown>>(supabase.from("albums").select("id,user_id,title,creator_name,producer_name,producer_id,producer_profile_id,owner_type,cover_url,category,release_date,created_at").limit(1000)),
  ]);

  const profileRow = profiles.find((profile) => matchesIdentifier(
    identifier,
    profile.id,
    profile.user_id,
    profile.name,
  ));

  const inferredRow = profileRow || beats.find((beat) => matchesIdentifier(identifier, beat.producer_id, beat.producer_user_id, beat.producer_name)) ||
    songs.find((song) => matchesIdentifier(identifier, song.producer_id, song.producer)) ||
    videos.find((video) => matchesIdentifier(identifier, video.producer_id, video.producer_profile_id, video.producer_name, video.producer)) ||
    albums.find((album) => matchesIdentifier(identifier, album.producer_id, album.producer_profile_id, album.producer_name, album.creator_name));

  if (!inferredRow) return null;

  const profile = createProducerProfile(inferredRow, identifier);
  profile.beats = sortRecent(beats.filter((beat) => hasCreatorMatch(beat, profile)).map(mapBeat));
  profile.songs = sortRecent(songs.filter((song) => hasCreatorMatch(song, profile)).map(mapSong));
  profile.videos = sortRecent(videos.filter((video) => hasCreatorMatch(video, profile)).map(mapVideo));
  profile.albums = sortRecent(albums.filter((album) => hasCreatorMatch(album, profile)).map(mapAlbum));

  return profile;
}
