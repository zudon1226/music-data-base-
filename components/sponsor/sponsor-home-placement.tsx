"use client";

import { useEffect, useState } from "react";
import { Play, Zap } from "lucide-react";

type SponsorAsset = {
    asset_type?: string;
    signedUrl?: string | null;
    alt_text?: string;
    destination_url?: string | null;
};

type SponsorPlacement = {
    id: string;
    business_name?: string;
    headline?: string;
    destination_url?: string | null;
    requested_placement?: string;
    sponsor_assets?: SponsorAsset[];
};

type Props = {
    onSponsorNow: () => void;
    onPlayFeature?: () => void;
    fallbackImage: string;
    fallbackTitle: string;
    fallbackCreator: string;
    fallbackCategory: string;
    showPlayFeature?: boolean;
};

export function SponsorHomePlacement({
    onSponsorNow,
    onPlayFeature,
    fallbackImage,
    fallbackTitle,
    fallbackCreator,
    fallbackCategory,
    showPlayFeature = true,
}: Props) {
    const [placement, setPlacement] = useState<SponsorPlacement | null>(null);

    useEffect(() => {
        let cancelled = false;
        void fetch("/api/sponsors/placements?placement=home_featured", { cache: "no-store" })
            .then((res) => res.json())
            .then((body) => {
                if (cancelled) return;
                const rows = Array.isArray(body.placements) ? body.placements as SponsorPlacement[] : [];
                setPlacement(rows[0] || null);
            })
            .catch(() => {
                if (!cancelled) setPlacement(null);
            });
        return () => { cancelled = true; };
    }, []);

    const bannerAsset = placement?.sponsor_assets?.find((a) => a.asset_type === "banner" || a.asset_type === "campaign_image")
        || placement?.sponsor_assets?.find((a) => a.asset_type === "logo");
    const imageUrl = bannerAsset?.signedUrl || fallbackImage;
    const title = placement?.headline || placement?.business_name || fallbackTitle;
    const creator = placement?.business_name || fallbackCreator;
    const destination = placement?.destination_url || bannerAsset?.destination_url || "";

    return (
        <section className="sponsor-section" aria-label="Sponsored music">
            <div className="sponsor-card">
                <div className="sponsor-media">
                    <img src={imageUrl} alt={bannerAsset?.alt_text || title}/>
                    <span>Sponsored</span>
                </div>
                <div className="sponsor-copy">
                    <p className="section-kicker">Sponsor Ad</p>
                    <h2>{title}</h2>
                    <p>
                        Featured from <strong>{creator}</strong>. Promote a song, artist profile, or video banner to listeners
                        across Music Data Base.
                    </p>
                    <div className="sponsor-meta">
                        <span>{fallbackCategory}</span>
                        <span>{placement ? "Paid campaign" : "Song spotlight"}</span>
                    </div>
                    <div className="sponsor-actions">
                        {showPlayFeature ? (
                            <button type="button" onClick={() => {
                                if (destination) {
                                    window.open(destination, "_blank", "noopener,noreferrer");
                                    return;
                                }
                                onPlayFeature?.();
                            }}>
                                <Play size={16} fill="currentColor"/>
                                {destination ? "Visit Sponsor" : "Play Feature"}
                            </button>
                        ) : null}
                        <button type="button" className="subtle-action" onClick={onSponsorNow}>
                            <Zap size={16}/>
                            Sponsor Now
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
