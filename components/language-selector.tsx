"use client";

import { Globe2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "../lib/i18n/provider";
import { listLanguagesSorted } from "../lib/i18n/registry";

type LanguageSelectorProps = {
    compact?: boolean;
    className?: string;
};

export function LanguageSelector({ compact = false, className = "" }: LanguageSelectorProps) {
    const { locale, setLocale, t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const languages = useMemo(() => listLanguagesSorted(), []);
    const filtered = useMemo(() => {
        const clean = query.trim().toLowerCase();
        if (!clean) return languages;
        return languages.filter((language) =>
            language.code.toLowerCase().includes(clean)
            || language.englishName.toLowerCase().includes(clean)
            || language.nativeName.toLowerCase().includes(clean));
    }, [languages, query]);

    return (
        <div className={`language-selector ${compact ? "language-selector-compact" : ""} ${className}`.trim()}>
            <button
                type="button"
                className="language-selector-trigger"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={t("languageSelector.title")}
                onClick={() => setOpen((value) => !value)}
            >
                <Globe2 size={16}/>
                {!compact ? <span>{languages.find((language) => language.code === locale)?.nativeName || locale}</span> : null}
            </button>
            {open ? (
                <div className="language-selector-panel" role="dialog" aria-label={t("languageSelector.title")}>
                    <label className="language-selector-search">
                        <Search size={14}/>
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t("languageSelector.searchPlaceholder")}
                            aria-label={t("languageSelector.searchPlaceholder")}
                        />
                    </label>
                    <ul role="listbox" aria-label={t("languageSelector.title")}>
                        {filtered.length === 0 ? (
                            <li className="language-selector-empty">{t("languageSelector.noMatches")}</li>
                        ) : filtered.map((language) => (
                            <li key={language.code}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={language.code === locale}
                                    className={language.code === locale ? "active" : ""}
                                    onClick={() => {
                                        void setLocale(language.code);
                                        setOpen(false);
                                        setQuery("");
                                    }}
                                >
                                    <strong>{language.nativeName}</strong>
                                    <span>{language.englishName}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
