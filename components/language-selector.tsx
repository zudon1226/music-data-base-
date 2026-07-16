"use client";

import { Globe2, Search } from "lucide-react";
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../lib/i18n/provider";
import { listLanguagesSorted, normalizeLocale, type SupportedLanguage } from "../lib/i18n/registry";

type LanguageSelectorProps = {
    compact?: boolean;
    className?: string;
};

type PanelPosition = {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
};

function measurePanelPosition(trigger: HTMLElement, panelWidth: number, maxPanelHeight: number): PanelPosition {
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(panelWidth, viewportWidth - 24);
    const mobile = viewportWidth <= 900;
    const playerReserve = mobile ? 80 : 12;

    if (mobile) {
        return {
            top: Math.max(12, viewportHeight - maxPanelHeight - playerReserve),
            left: 12,
            width: viewportWidth - 24,
            maxHeight: Math.min(maxPanelHeight, viewportHeight - playerReserve - 24),
        };
    }

    let left = rect.right - width;
    left = Math.max(12, Math.min(left, viewportWidth - width - 12));
    let top = rect.bottom + 6;
    const availableBelow = viewportHeight - top - 12;
    const availableAbove = rect.top - 12;
    let maxHeight = Math.min(maxPanelHeight, availableBelow);
    if (maxHeight < 180 && availableAbove > availableBelow) {
        maxHeight = Math.min(maxPanelHeight, availableAbove - 6);
        top = Math.max(12, rect.top - maxHeight - 6);
    }

    return { top, left, width, maxHeight };
}

export function LanguageSelector({ compact = false, className = "" }: LanguageSelectorProps) {
    const { locale, setLocale, t } = useTranslation();
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [focusedIndex, setFocusedIndex] = useState(0);
    const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
    const [mounted, setMounted] = useState(false);

    const languages = useMemo(() => listLanguagesSorted(), []);
    const filtered = useMemo(() => {
        const clean = query.trim().toLowerCase();
        if (!clean) return languages;
        return languages.filter((language) =>
            language.code.toLowerCase().includes(clean)
            || language.englishName.toLowerCase().includes(clean)
            || language.nativeName.toLowerCase().includes(clean));
    }, [languages, query]);

    const activeLanguage = languages.find((language) => language.code === locale);

    const closePanel = useCallback((restoreFocus = true) => {
        setOpen(false);
        setQuery("");
        setFocusedIndex(0);
        if (restoreFocus) {
            window.requestAnimationFrame(() => triggerRef.current?.focus());
        }
    }, []);

    const selectLanguage = useCallback(async (language: SupportedLanguage) => {
        const normalized = normalizeLocale(language.code);
        await setLocale(normalized);
        closePanel(true);
    }, [closePanel, setLocale]);

    const updatePanelPosition = useCallback(() => {
        if (!triggerRef.current) return;
        setPanelPosition(measurePanelPosition(triggerRef.current, 280, 360));
    }, []);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) return;
        updatePanelPosition();
        const onResize = () => updatePanelPosition();
        window.addEventListener("resize", onResize);
        window.addEventListener("scroll", onResize, true);
        return () => {
            window.removeEventListener("resize", onResize);
            window.removeEventListener("scroll", onResize, true);
        };
    }, [open, updatePanelPosition]);

    useEffect(() => {
        if (!open) return;
        const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, [open]);

    useEffect(() => {
        if (focusedIndex >= filtered.length) {
            setFocusedIndex(Math.max(0, filtered.length - 1));
        }
    }, [filtered.length, focusedIndex]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (rootRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            closePanel(true);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closePanel(true);
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [closePanel, open]);

    const onTriggerClick = () => {
        setOpen((value) => {
            const next = !value;
            if (next) updatePanelPosition();
            return next;
        });
    };

    const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
        if (filtered.length === 0) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setFocusedIndex((index) => Math.min(index + 1, filtered.length - 1));
        }
        else if (event.key === "ArrowUp") {
            event.preventDefault();
            setFocusedIndex((index) => Math.max(index - 1, 0));
        }
        else if (event.key === "Home") {
            event.preventDefault();
            setFocusedIndex(0);
        }
        else if (event.key === "End") {
            event.preventDefault();
            setFocusedIndex(filtered.length - 1);
        }
        else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const language = filtered[focusedIndex];
            if (language) void selectLanguage(language);
        }
    };

    const panel = open && panelPosition && mounted ? createPortal(
        <>
            <button
                type="button"
                className="language-selector-backdrop"
                aria-label={t("common.close")}
                tabIndex={-1}
                onClick={() => closePanel(true)}
            />
            <div
                ref={panelRef}
                className="language-selector-panel language-selector-panel-portal"
                role="dialog"
                aria-label={t("languageSelector.title")}
                style={{
                    top: `${panelPosition.top}px`,
                    left: `${panelPosition.left}px`,
                    width: `${panelPosition.width}px`,
                    maxHeight: `${panelPosition.maxHeight}px`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <label className="language-selector-search">
                    <Search size={14}/>
                    <input
                        ref={searchRef}
                        type="search"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setFocusedIndex(0);
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                                event.preventDefault();
                                setFocusedIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
                            }
                            else if (event.key === "ArrowUp") {
                                event.preventDefault();
                                setFocusedIndex((index) => Math.max(index - 1, 0));
                            }
                            else if (event.key === "Enter" && filtered[focusedIndex]) {
                                event.preventDefault();
                                void selectLanguage(filtered[focusedIndex]);
                            }
                            else if (event.key === "Escape") {
                                event.preventDefault();
                                closePanel(true);
                            }
                        }}
                        placeholder={t("languageSelector.searchPlaceholder")}
                        aria-label={t("languageSelector.searchPlaceholder")}
                        aria-controls={listId}
                    />
                </label>
                <ul
                    id={listId}
                    role="listbox"
                    aria-label={t("languageSelector.title")}
                    aria-activedescendant={filtered[focusedIndex] ? `language-option-${filtered[focusedIndex].code}` : undefined}
                    onKeyDown={onListKeyDown}
                    tabIndex={-1}
                >
                    {filtered.length === 0 ? (
                        <li className="language-selector-empty">{t("languageSelector.noMatches")}</li>
                    ) : filtered.map((language, index) => (
                        <li key={language.code}>
                            <button
                                id={`language-option-${language.code}`}
                                type="button"
                                role="option"
                                data-locale={language.code}
                                aria-selected={language.code === locale}
                                className={[
                                    language.code === locale ? "active" : "",
                                    index === focusedIndex ? "focused" : "",
                                ].filter(Boolean).join(" ")}
                                onMouseEnter={() => setFocusedIndex(index)}
                                onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void selectLanguage(language);
                                }}
                            >
                                <strong>{language.nativeName}</strong>
                                <span>{language.englishName}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </>,
        document.body,
    ) : null;

    return (
        <div
            ref={rootRef}
            className={`language-selector ${compact ? "language-selector-compact" : ""} ${open ? "language-selector-open" : ""} ${className}`.trim()}
        >
            <button
                ref={triggerRef}
                type="button"
                className="language-selector-trigger"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={t("languageSelector.title")}
                onClick={onTriggerClick}
            >
                <Globe2 size={16}/>
                {!compact ? <span>{activeLanguage?.nativeName || locale}</span> : null}
            </button>
            {panel}
        </div>
    );
}
