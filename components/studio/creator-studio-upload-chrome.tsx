"use client";

import {
    uploadModesForStudio,
    type CreatorStudioKind,
    type CreatorStudioUploadMode,
} from "@/lib/creator-studio";
import { useTranslation } from "@/lib/i18n/provider";

type CreatorStudioUploadChromeProps = {
    studio: CreatorStudioKind;
    canArtistStudio: boolean;
    canProducerStudio: boolean;
    activeMode: CreatorStudioUploadMode;
    brandLogo: string;
    onStudioChange: (studio: CreatorStudioKind) => void;
    onSelectMode: (mode: CreatorStudioUploadMode) => void;
};

export function CreatorStudioUploadChrome({
    studio,
    canArtistStudio,
    canProducerStudio,
    activeMode,
    brandLogo,
    onStudioChange,
    onSelectMode,
}: CreatorStudioUploadChromeProps) {
    const { t } = useTranslation();
    const canSwitch = canArtistStudio && canProducerStudio;
    const modes = uploadModesForStudio(studio);
    const title = studio === "producer" ? t("upload.producerStudio") : t("upload.artistStudio");
    const subtitle = studio === "producer"
        ? t("upload.producerStudioSubtitle")
        : t("upload.artistStudioSubtitle");

    return (
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
    );
}
