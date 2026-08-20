"use client";

import {
    uploadModesForStudio,
    type CreatorStudioKind,
    type CreatorStudioUploadMode,
} from "@/lib/creator-studio";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/lib/i18n/provider";

type CreatorStudioUploadChromeProps = {
    studio: CreatorStudioKind;
    canArtistStudio: boolean;
    canProducerStudio: boolean;
    activeMode: CreatorStudioUploadMode;
    brandLogo: string;
    onStudioChange: (studio: CreatorStudioKind) => void;
    onSelectMode: (mode: CreatorStudioUploadMode) => void;
    /** Mobile-only exit control rendered above the Creator Upload card. */
    onBack?: () => void;
};

export function CreatorStudioUploadChrome({
    studio,
    canArtistStudio,
    canProducerStudio,
    activeMode,
    brandLogo,
    onStudioChange,
    onSelectMode,
    onBack,
}: CreatorStudioUploadChromeProps) {
    const { t } = useTranslation();
    const canSwitch = canArtistStudio && canProducerStudio;
    const modes = uploadModesForStudio(studio);
    const title = studio === "producer" ? t("upload.producerStudio") : t("upload.artistStudio");
    const subtitle = studio === "producer"
        ? t("upload.producerStudioSubtitle")
        : t("upload.artistStudioSubtitle");

    return (
        <>
            <style>{`
                .studio-mobile-back-btn {
                    display: none;
                }
                @media (max-width: 820px) {
                    .studio-mobile-back-btn {
                        display: inline-flex !important;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        width: fit-content;
                        max-width: 100%;
                        min-height: 36px;
                        height: 36px;
                        margin: 0 0 8px;
                        padding: 0 12px;
                        border-radius: 8px;
                        border: 1px solid rgba(34, 211, 238, 0.55);
                        background: #0b1736;
                        color: #67e8f9;
                        font-size: 13px;
                        font-weight: 800;
                        box-sizing: border-box;
                        position: static;
                    }
                }
            `}</style>
            {studio === "producer" && onBack ? (
                <button
                    type="button"
                    className="studio-mobile-back-btn"
                    onClick={onBack}
                    title="Back"
                    aria-label="Back"
                >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Back
                </button>
            ) : null}
            <header className="creator-studio-chrome" data-creator-studio={studio}>
                <div className="creator-studio-chrome-brand">
                    <img src={brandLogo} alt="" width={56} height={56} />
                    <div>
                        <p className="creator-studio-kicker">{t("upload.studioKicker")}</p>
                        <h2>{title}</h2>
                        <p className="creator-studio-subtitle">{subtitle}</p>
                    </div>
                </div>

                {canSwitch ? (
                    <div className="creator-studio-switcher" role="group" aria-label={t("upload.switchStudio")}>
                        <button
                            type="button"
                            className={studio === "artist" ? "active" : ""}
                            aria-pressed={studio === "artist"}
                            onClick={() => onStudioChange("artist")}
                        >
                            {t("upload.artistStudio")}
                        </button>
                        <button
                            type="button"
                            className={studio === "producer" ? "active" : ""}
                            aria-pressed={studio === "producer"}
                            onClick={() => onStudioChange("producer")}
                        >
                            {t("upload.producerStudio")}
                        </button>
                    </div>
                ) : null}

                <div className="upload-mode-tabs" role="tablist" aria-label={title}>
                    {modes.map((entry) => (
                        <button
                            key={entry.mode}
                            type="button"
                            role="tab"
                            aria-selected={activeMode === entry.mode}
                            className={activeMode === entry.mode ? "active" : ""}
                            onClick={() => onSelectMode(entry.mode)}
                        >
                            {t(entry.labelKey)}
                        </button>
                    ))}
                </div>
            </header>
        </>
    );
}
