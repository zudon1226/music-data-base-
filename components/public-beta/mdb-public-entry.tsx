"use client";

import { useCallback, useState, type FormEvent } from "react";
import { PolicyLinksFooter } from "../legal/policy-links-footer";
import "./mdb-public-entry.css";

const BRAND_LOGO = "/music-data-base-logo.png";
const BRAND_TAGLINE = "STREAM • DISCOVER • CREATE";
const LOCAL_NOTIFY_KEY = "mdb_listener_launch_notify_v1";

type MdbPublicEntryHubProps = {
    onGetNotified: () => void;
    onJoinBeta: () => void;
    onLogin: () => void;
};

export function MdbPublicEntryHub({ onGetNotified, onJoinBeta, onLogin }: MdbPublicEntryHubProps) {
    return (
        <main className="mdb-public-entry-page">
            <section className="mdb-public-entry-panel">
                <div className="mdb-public-entry-mark">
                    <img src={BRAND_LOGO} alt="Music Data Base" />
                    <span>{BRAND_TAGLINE}</span>
                </div>
                <h1 className="mdb-public-entry-title">MDB</h1>
                <p className="mdb-public-entry-coming-soon">COMING SOON</p>

                <div className="mdb-public-entry-grid">
                    <article className="mdb-public-entry-card">
                        <h2>LISTENERS</h2>
                        <p>Discover music, videos, podcasts and ringtones.</p>
                        <button type="button" className="mdb-public-entry-action" onClick={onGetNotified}>
                            GET NOTIFIED
                        </button>
                    </article>

                    <article className="mdb-public-entry-card">
                        <h2>ARTISTS &amp; PRODUCERS</h2>
                        <p>Upload your content and help shape MDB during beta.</p>
                        <button type="button" className="mdb-public-entry-action" onClick={onJoinBeta}>
                            JOIN THE BETA
                        </button>
                    </article>
                </div>

                <div className="mdb-public-entry-login-link">
                    <button type="button" onClick={onLogin}>
                        Already have an account? Log in
                    </button>
                </div>

                <PolicyLinksFooter className="auth-legal-links" />
            </section>
        </main>
    );
}

type MdbPublicEntryNotifyProps = {
    onBack: () => void;
};

export function MdbPublicEntryNotify({ onBack }: MdbPublicEntryNotifyProps) {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [tone, setTone] = useState<"success" | "error" | "">("");

    const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;

        const trimmed = email.trim().toLowerCase();
        if (!trimmed) {
            setTone("error");
            setMessage("Email is required.");
            return;
        }

        if (typeof window !== "undefined") {
            const prior = window.localStorage.getItem(LOCAL_NOTIFY_KEY);
            if (prior && prior === trimmed) {
                setTone("success");
                setMessage("This email is already registered for launch updates on this device.");
                return;
            }
        }

        setBusy(true);
        setMessage("");
        setTone("");
        try {
            const response = await fetch("/api/launch/listener-notify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: trimmed, website: "" }),
            });
            const payload = (await response.json().catch(() => ({}))) as {
                ok?: boolean;
                message?: string;
                error?: string;
                duplicate?: boolean;
            };
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || "Could not save your notification request.");
            }
            if (typeof window !== "undefined") {
                window.localStorage.setItem(LOCAL_NOTIFY_KEY, trimmed);
            }
            setTone("success");
            setMessage(payload.message || "Thanks! We will notify you when Music Data Base launches.");
            if (!payload.duplicate) {
                setEmail("");
            }
        }
        catch (submitError) {
            setTone("error");
            setMessage(submitError instanceof Error ? submitError.message : "Could not save your notification request.");
        }
        finally {
            setBusy(false);
        }
    }, [busy, email]);

    return (
        <main className="mdb-public-entry-page">
            <section className="mdb-public-entry-panel">
                <div className="mdb-public-entry-mark">
                    <img src={BRAND_LOGO} alt="Music Data Base" />
                    <span>{BRAND_TAGLINE}</span>
                </div>
                <h1 className="mdb-public-entry-title">MDB</h1>
                <p className="mdb-public-entry-coming-soon">COMING SOON</p>

                <article className="mdb-public-entry-card">
                    <h2>LISTENERS</h2>
                    <p>Get an email when Music Data Base launches. This is not a paid signup.</p>
                    <form className="mdb-public-entry-form" onSubmit={submit}>
                        <label htmlFor="mdb-listener-notify-email">
                            Email
                            <input
                                id="mdb-listener-notify-email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                disabled={busy}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="you@example.com"
                            />
                        </label>
                        <label className="mdb-public-entry-honeypot" aria-hidden="true">
                            Website
                            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                        </label>
                        {message ? (
                            <p className={`mdb-public-entry-message${tone ? ` is-${tone}` : ""}`} role="status">
                                {message}
                            </p>
                        ) : null}
                        <button type="submit" className="mdb-public-entry-action" disabled={busy || !email.trim()}>
                            {busy ? "Saving…" : "GET NOTIFIED"}
                        </button>
                    </form>
                </article>

                <button type="button" className="mdb-public-entry-back" onClick={onBack}>
                    Back to audience options
                </button>

                <PolicyLinksFooter className="auth-legal-links" />
            </section>
        </main>
    );
}
