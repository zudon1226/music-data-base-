"use client";

import Link from "next/link";
import { useState } from "react";
import { getCurrentPolicyVersion, getLegalPolicyByType } from "@/lib/legal-policies";
import { recordCreatorUploadLegalAcceptance } from "@/lib/ringtone-creator-client";
import type { Session } from "@supabase/supabase-js";

type Props = {
    userId: string;
    session: Session | null;
    onAccepted: () => void;
    labels: {
        review: string;
        checkbox: string;
        accept: string;
        accepting: string;
        failed: string;
    };
};

export function CreatorUploadAgreementPanel({ userId, session, onAccepted, labels }: Props) {
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const policy = getLegalPolicyByType("creator_upload");
    const policyPath = policy?.publicPath || "/legal/creator-upload";

    async function handleAccept() {
        if (!checked || busy) return;
        setBusy(true);
        setError("");
        const result = await recordCreatorUploadLegalAcceptance(userId, session);
        setBusy(false);
        if (!result.ok) {
            setError(typeof result.body.error === "string" ? result.body.error : labels.failed);
            return;
        }
        onAccepted();
    }

    return (
        <article className="ringtone-legal-gate" role="region" aria-label="Creator upload agreement">
            <p>
                <Link href={policyPath} target="_blank" rel="noopener noreferrer">
                    {labels.review}
                </Link>
            </p>
            <label className="ringtone-checkbox">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => setChecked(event.target.checked)}
                    disabled={busy}
                />
                <span>{labels.checkbox}</span>
            </label>
            <button type="button" onClick={() => void handleAccept()} disabled={!checked || busy}>
                {busy ? labels.accepting : labels.accept}
            </button>
            {error ? <p className="ringtone-error" role="alert">{error}</p> : null}
            <p className="ringtone-legal-meta" hidden>
                v{getCurrentPolicyVersion("creator_upload")}
            </p>
        </article>
    );
}