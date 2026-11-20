"use client";

import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    mergeMineCatalogResponse,
    shouldApplyMineCatalogRequest,
    shouldClearStudioLoading,
    upsertMixtapeById,
} from "@/lib/mixtape-studio-catalog";
import { ImagePlus, LoaderCircle, Plus, UploadCloud } from "lucide-react";
import { authFetch } from "@/lib/client-api-auth";
import type { Mixtape, MixtapeTrack } from "@/lib/mixtape-types";
import { supabase } from "@/lib/supabase";
import { uploadFileToSignedSupabaseStorage } from "@/lib/supabase-storage-upload";
import { MixtapeStudioAnalyticsPanel } from "@/components/mixtapes/MixtapeStudioAnalyticsPanel";
import styles from "./mixtapes.module.css";

type MixtapeStudioWorkspaceProps = {
    userId: string;
};

type CollectionResponse = {
    mixtapes?: Mixtape[];
    tracks?: MixtapeTrack[];
    error?: string;
};

const emptyForm = {
    title: "",
    description: "",
    genre: "",
};

export function MixtapeStudioWorkspace({ userId }: MixtapeStudioWorkspaceProps) {
    const [mixtapes, setMixtapes] = useState<Mixtape[]>([]);
    const [tracks, setTracks] = useState<MixtapeTrack[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [uploading, setUploading] = useState(false);
    const [coverUploading, setCoverUploading] = useState(false);
    const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
    const [statusBusy, setStatusBusy] = useState(false);
    const [createdDraft, setCreatedDraft] = useState<Mixtape | null>(null);
    const loadSeqRef = useRef(0);
    const selectedIdRef = useRef("");
    const createdDraftRef = useRef<Mixtape | null>(null);
    const studioCatalogReadyRef = useRef(false);

    useEffect(() => {
        selectedIdRef.current = selectedId;
    }, [selectedId]);

    useEffect(() => {
        createdDraftRef.current = createdDraft;
    }, [createdDraft]);

    const studioMixtapes = useMemo(() => {
        if (!createdDraft) return mixtapes;
        return upsertMixtapeById(mixtapes, createdDraft);
    }, [createdDraft, mixtapes]);

    const selectedMixtape = useMemo(
        () => studioMixtapes.find((mixtape) => mixtape.id === selectedId) || null,
        [studioMixtapes, selectedId],
    );

    const loadMine = useCallback(async (signal?: AbortSignal) => {
        const requestSeq = ++loadSeqRef.current;
        const showLoading = !studioCatalogReadyRef.current;
        if (showLoading) setLoading(true);
        setError("");
        try {
            const response = await authFetch(
                supabase,
                `/api/mixtapes?scope=mine&userId=${encodeURIComponent(userId)}`,
                { cache: "no-store", signal },
            );
            const body = (await response.json().catch(() => ({}))) as CollectionResponse;
            if (signal?.aborted) return;
            if (!response.ok) throw new Error(body.error || "Studio catalog could not be loaded.");
            if (!shouldApplyMineCatalogRequest(requestSeq, loadSeqRef.current, false)) return;
            const nextMixtapes = Array.isArray(body.mixtapes) ? body.mixtapes : [];
            const nextTracks = Array.isArray(body.tracks) ? body.tracks : [];
            setMixtapes((prev) => mergeMineCatalogResponse(nextMixtapes, prev, selectedIdRef.current));
            setTracks(nextTracks);
            studioCatalogReadyRef.current = true;
            const draft = createdDraftRef.current;
            if (draft && nextMixtapes.some((mixtape) => mixtape.id === draft.id)) {
                setCreatedDraft(null);
            }
            setSelectedId((current) => current || nextMixtapes[0]?.id || "");
        }
        catch (loadError) {
            if (signal?.aborted) return;
            if (!shouldApplyMineCatalogRequest(requestSeq, loadSeqRef.current, false)) return;
            setError(loadError instanceof Error ? loadError.message : "Studio catalog could not be loaded.");
        }
        finally {
            if (showLoading && shouldClearStudioLoading(requestSeq, loadSeqRef.current)) {
                setLoading(false);
            }
        }
    }, [userId]);

    useEffect(() => {
        const controller = new AbortController();
        void loadMine(controller.signal);
        return () => controller.abort();
    }, [loadMine]);

    useEffect(() => {
        let active = true;
        const path = selectedMixtape?.coverStoragePath?.trim() || "";
        const legacyUrl = selectedMixtape?.coverImageUrl?.trim() || "";
        if (!path && !legacyUrl) {
            setCoverPreviewUrl("");
            return () => {
                active = false;
            };
        }
        if (legacyUrl && !path) {
            setCoverPreviewUrl(legacyUrl);
            return () => {
                active = false;
            };
        }
        void supabase.storage.from("mixtapes").createSignedUrl(path, 3600).then(({ data, error }) => {
            if (!active) return;
            if (!error && data?.signedUrl) {
                setCoverPreviewUrl(data.signedUrl);
                return;
            }
            setCoverPreviewUrl(legacyUrl);
        });
        return () => {
            active = false;
        };
    }, [selectedMixtape?.coverImageUrl, selectedMixtape?.coverStoragePath, selectedMixtape?.id]);

    const createMixtape = async (event?: FormEvent) => {
        event?.preventDefault();
        setMessage("");
        const response = await authFetch(supabase, "/api/mixtapes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, ...form, status: "draft" }),
        });
        const body = (await response.json().catch(() => ({}))) as { mixtape?: Mixtape; error?: string };
        if (!response.ok || !body.mixtape) {
            setError(body.error || "Mixtape could not be created.");
            return;
        }
        const created = body.mixtape as Mixtape;
        setForm(emptyForm);
        studioCatalogReadyRef.current = true;
        setLoading(false);
        setCreatedDraft(created);
        setMixtapes((prev) => upsertMixtapeById(prev, created));
        setSelectedId(created.id);
        selectedIdRef.current = created.id;
        setMessage("Mixtape created.");
        void loadMine();
    };

    const patchMixtapeStatus = async (
        status: "published" | "draft" | "archived",
        options: { method?: "PATCH" | "DELETE"; confirmMessage?: string } = {},
    ) => {
        if (!selectedId) return;
        const confirmMessage = options.confirmMessage
            || (status === "draft"
                ? "Unpublish this mixtape? New public playback and signed URLs will stop for listeners."
                : status === "archived"
                    ? "Archive this mixtape? It will be hidden from discovery; audio files stay in storage."
                    : "");
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        setStatusBusy(true);
        setError("");
        try {
            const method = options.method || "PATCH";
            const response = await authFetch(supabase, `/api/mixtapes/${encodeURIComponent(selectedId)}`, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    method === "DELETE"
                        ? { userId }
                        : { userId, status: status === "draft" ? "draft" : status },
                ),
            });
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (!response.ok) throw new Error(body.error || "Mixtape status could not be updated.");
            setMessage(
                status === "published"
                    ? "Mixtape published."
                    : status === "draft"
                        ? "Mixtape unpublished."
                        : "Mixtape archived.",
            );
            if (status === "archived") {
                setSelectedId("");
            }
            await loadMine();
        }
        catch (statusError) {
            setError(statusError instanceof Error ? statusError.message : "Mixtape status could not be updated.");
        }
        finally {
            setStatusBusy(false);
        }
    };

    const uploadCover = async (file: File) => {
        if (!selectedId) return;
        setCoverUploading(true);
        setError("");
        try {
            const prepare = await authFetch(supabase, "/api/mixtapes/uploads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    action: "prepare-cover",
                    mixtapeId: selectedId,
                    fileName: file.name,
                    contentType: file.type,
                    fileSize: file.size,
                }),
            });
            const prepared = (await prepare.json().catch(() => ({}))) as {
                signedUrl?: string;
                token?: string;
                storagePath?: string;
                contentType?: string;
                error?: string;
            };
            if (!prepare.ok || !prepared.storagePath || !prepared.signedUrl || !prepared.token) {
                throw new Error(prepared.error || "Cover upload could not be prepared.");
            }
            await uploadFileToSignedSupabaseStorage(
                prepared.signedUrl,
                prepared.token || "",
                file,
                prepared.contentType || file.type,
            );
            const patch = await authFetch(supabase, `/api/mixtapes/${encodeURIComponent(selectedId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    coverStoragePath: prepared.storagePath,
                    coverImageUrl: "",
                }),
            });
            const patched = (await patch.json().catch(() => ({}))) as { error?: string };
            if (!patch.ok) throw new Error(patched.error || "Cover could not be saved on the mixtape.");
            setMessage("Cover artwork updated.");
            await loadMine();
        }
        catch (coverError) {
            setError(coverError instanceof Error ? coverError.message : "Cover upload failed.");
        }
        finally {
            setCoverUploading(false);
        }
    };

    const uploadTrack = async (file: File) => {
        if (!selectedId) return;
        setUploading(true);
        setError("");
        try {
            const prepare = await authFetch(supabase, "/api/mixtapes/uploads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    action: "prepare-audio",
                    mixtapeId: selectedId,
                    fileName: file.name,
                    contentType: file.type,
                    fileSize: file.size,
                }),
            });
            const prepared = (await prepare.json().catch(() => ({}))) as {
                signedUrl?: string;
                token?: string;
                storagePath?: string;
                error?: string;
            };
            if (!prepare.ok || !prepared.storagePath) {
                throw new Error(prepared.error || "Signed upload could not be prepared.");
            }
            if (!prepared.signedUrl || !prepared.token) {
                throw new Error("Signed track upload details are incomplete.");
            }
            await uploadFileToSignedSupabaseStorage(
                prepared.signedUrl,
                prepared.token,
                file,
                file.type,
            );
            const nextPosition = tracks.filter((track) => track.mixtapeId === selectedId).length + 1;
            const create = await authFetch(supabase, "/api/mixtapes/tracks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    mixtapeId: selectedId,
                    title: file.name.replace(/\.[^.]+$/, ""),
                    position: nextPosition,
                    storagePath: prepared.storagePath,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    durationSeconds: 1,
                    status: "draft",
                }),
            });
            const created = (await create.json().catch(() => ({}))) as { error?: string };
            if (!create.ok) throw new Error(created.error || "Track could not be saved.");
            setMessage("Track uploaded.");
            await loadMine();
        }
        catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
        }
        finally {
            setUploading(false);
        }
    };

    const selectedTracks = tracks
        .filter((track) => track.mixtapeId === selectedId)
        .sort((left, right) => left.position - right.position);

    return (
        <section className={styles.workspace} data-mixtape-studio>
            <header className={styles.discoveryHeader}>
                <h2>Mixtape Studio</h2>
            </header>
            {loading ? <p><LoaderCircle size={18} aria-hidden /> Loading studio…</p> : null}
            {error ? <div className={styles.errorState}>{error}</div> : null}
            {message ? <p>{message}</p> : null}

            <div className={styles.studioGrid}>
                <div className={styles.formField}>
                    <label htmlFor="mixtape-title">Title</label>
                    <input id="mixtape-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required />
                </div>
                <div className={styles.formField}>
                    <label htmlFor="mixtape-description">Description</label>
                    <textarea id="mixtape-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} />
                </div>
                <div className={styles.formField}>
                    <label htmlFor="mixtape-genre">Genre</label>
                    <input id="mixtape-genre" value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })} />
                </div>
                <button type="button" onClick={() => void createMixtape()}><Plus size={16} aria-hidden /> Create mixtape</button>
            </div>

            <div className={styles.formField}>
                <label htmlFor="mixtape-select">Your mixtapes</label>
                <select id="mixtape-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                    <option value="">Select mixtape</option>
                    {studioMixtapes.map((mixtape) => (
                        <option key={mixtape.id} value={mixtape.id}>{mixtape.title}</option>
                    ))}
                </select>
            </div>

            {selectedId && selectedMixtape ? (
                <>
                    <MotionStatusRow
                        status={selectedMixtape.status}
                        busy={statusBusy}
                        onPublish={() => void patchMixtapeStatus("published", {
                            confirmMessage: "Publish this mixtape? Published tracks become eligible for signed listener playback.",
                        })}
                        onUnpublish={() => void patchMixtapeStatus("draft", {
                            confirmMessage: "Unpublish this mixtape? Public listeners will no longer get playback URLs.",
                        })}
                        onArchive={() => void patchMixtapeStatus("archived", {
                            method: "DELETE",
                            confirmMessage: "Archive this mixtape? Audio files stay in storage; the mixtape leaves discovery.",
                        })}
                    />

                    <MotionCoverBlock
                        previewUrl={coverPreviewUrl}
                        uploading={coverUploading}
                        onSelectFile={(file) => void uploadCover(file)}
                    />

                    <div className={styles.listeningMenuRow}>
                        <label>
                            <UploadCloud size={16} aria-hidden /> Upload track
                            <input
                                type="file"
                                accept="audio/mpeg,audio/mp4,audio/aac,audio/m4a,audio/x-m4a"
                                disabled={uploading || coverUploading}
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file) void uploadTrack(file);
                                    event.currentTarget.value = "";
                                }}
                            />
                        </label>
                        {uploading ? <span><LoaderCircle size={16} aria-hidden /> Uploading track…</span> : null}
                    </div>
                    <MotionTrackList tracks={selectedTracks} mixtapeId={selectedId} userId={userId} onReload={() => void loadMine()} />
                </>
            ) : null}

            <MixtapeStudioAnalyticsPanel userId={userId} />
        </section>
    );
}

function MotionStatusRow({
    status,
    busy,
    onPublish,
    onUnpublish,
    onArchive,
}: {
    status: Mixtape["status"];
    busy: boolean;
    onPublish: () => void;
    onUnpublish: () => void;
    onArchive: () => void;
}) {
    const badgeClass = status === "published"
        ? styles.statusBadge
        : status === "archived"
            ? `${styles.statusBadge} ${styles.statusBadgeArchived}`
            : `${styles.statusBadge} ${styles.statusBadgeDraft}`;
    return (
        <div className={styles.listeningMenuRow}>
            <span className={badgeClass} aria-live="polite">Status: {status}</span>
            {status !== "published" && status !== "archived" ? (
                <button type="button" disabled={busy} onClick={onPublish}>Publish mixtape</button>
            ) : null}
            {status === "published" ? (
                <button type="button" disabled={busy} onClick={onUnpublish}>Unpublish</button>
            ) : null}
            {status !== "archived" ? (
                <button type="button" disabled={busy} onClick={onArchive}>Archive</button>
            ) : null}
        </div>
    );
}

function MotionCoverBlock({
    previewUrl,
    uploading,
    onSelectFile,
}: {
    previewUrl: string;
    uploading: boolean;
    onSelectFile: (file: File) => void;
}) {
    return (
        <div className={styles.studioCoverBlock}>
            <div
                className={styles.coverPreview}
                style={previewUrl ? { backgroundImage: `url(${JSON.stringify(previewUrl)})` } : undefined}
                role="img"
                aria-label={previewUrl ? "Mixtape cover preview" : "No cover artwork yet"}
            />
            <div className={styles.formField}>
                <label>
                    <ImagePlus size={16} aria-hidden /> {previewUrl ? "Replace cover" : "Upload cover"}
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploading}
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onSelectFile(file);
                            event.currentTarget.value = "";
                        }}
                    />
                </label>
                {uploading ? <p><LoaderCircle size={16} aria-hidden /> Uploading cover…</p> : null}
                <small>JPEG, PNG, or WebP up to 20MB. Stored in your private mixtapes bucket.</small>
            </div>
        </div>
    );
}

function MotionTrackList({
    tracks,
    mixtapeId,
    userId,
    onReload,
}: {
    tracks: MixtapeTrack[];
    mixtapeId: string;
    userId: string;
    onReload: () => void;
}) {
    const moveTrack = async (trackId: string, position: number) => {
        await authFetch(supabase, `/api/mixtapes/tracks/${encodeURIComponent(trackId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, position }),
        });
        onReload();
    };

    return (
        <div className={styles.trackList}>
            {tracks.map((track) => (
                <MotionTrackRow key={track.id} track={track} mixtapeId={mixtapeId} userId={userId} onMove={moveTrack} onReload={onReload} />
            ))}
        </div>
    );
}

function MotionTrackRow({
    track,
    mixtapeId,
    userId,
    onMove,
    onReload,
}: {
    track: MixtapeTrack;
    mixtapeId: string;
    userId: string;
    onMove: (trackId: string, position: number) => Promise<void>;
    onReload: () => void;
}) {
    return (
        <MotionTrackDiv className={styles.trackRow}>
            <span>{track.position}.</span>
            <strong>{track.title}</strong>
            <span>{track.status}</span>
            <button type="button" onClick={() => void onMove(track.id, Math.max(1, track.position - 1))}>Up</button>
            <button type="button" onClick={() => void onMove(track.id, track.position + 1)}>Down</button>
            {track.status === "published" ? (
                <button
                    type="button"
                    onClick={() => {
                        if (!window.confirm("Unpublish this track? It will stop appearing in public playback.")) return;
                        void authFetch(supabase, `/api/mixtapes/tracks/${encodeURIComponent(track.id)}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId, mixtapeId, status: "draft" }),
                        }).then(onReload);
                    }}
                >
                    Unpublish
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => authFetch(supabase, `/api/mixtapes/tracks/${encodeURIComponent(track.id)}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId, mixtapeId, status: "published", durationSeconds: track.durationSeconds || 1 }),
                    }).then(onReload)}
                >
                    Publish
                </button>
            )}
        </MotionTrackDiv>
    );
}

function MotionTrackDiv({ className, children }: { className: string; children: ReactNode }) {
    return <div className={className}>{children}</div>;
}