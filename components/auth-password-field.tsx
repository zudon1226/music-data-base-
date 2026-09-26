"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

type AuthPasswordFieldProps = {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    autoComplete?: string;
    name?: string;
    disabled?: boolean;
    showPasswordLabel: string;
    hidePasswordLabel: string;
};

export function AuthPasswordField({
    label,
    value,
    onChange,
    placeholder,
    autoComplete,
    name,
    disabled = false,
    showPasswordLabel,
    hidePasswordLabel,
}: AuthPasswordFieldProps) {
    const [visible, setVisible] = useState(false);
    const inputId = useId();
    const toggleLabel = visible ? hidePasswordLabel : showPasswordLabel;

    return (
        <label className="auth-password-field" htmlFor={inputId}>
            <span>{label}</span>
            <div className="auth-password-input-wrap">
                <input
                    id={inputId}
                    name={name}
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    disabled={disabled}
                />
                <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setVisible((previous) => !previous)}
                    aria-label={toggleLabel}
                    aria-pressed={visible}
                    aria-controls={inputId}
                    disabled={disabled}
                >
                    {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
            </div>
            <style>{`
              .auth-password-field {
                display: grid;
                gap: 9px;
              }
              .auth-password-input-wrap {
                position: relative;
                width: 100%;
                min-width: 0;
              }
              .auth-password-input-wrap input,
              .auth-password-input-wrap input[type="password"],
              .auth-password-input-wrap input[type="text"] {
                height: 40px;
                min-height: 40px;
                max-height: 40px;
                width: 100%;
                box-sizing: border-box;
                border-radius: 8px;
                border: 1px solid #263c78;
                background: var(--mdb-bg) !important;
                background-color: var(--mdb-bg) !important;
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
                caret-color: #ffffff;
                padding: 0 48px 0 12px;
                outline: none;
                font-size: 16px;
                font-family: inherit;
                -webkit-appearance: none;
                appearance: none;
              }
              .auth-password-input-wrap input::placeholder {
                color: var(--mdb-text-secondary) !important;
                -webkit-text-fill-color: var(--mdb-text-secondary) !important;
                opacity: 1;
              }
              .auth-password-input-wrap input:-webkit-autofill,
              .auth-password-input-wrap input:-webkit-autofill:hover,
              .auth-password-input-wrap input:-webkit-autofill:focus,
              .auth-password-input-wrap input:-webkit-autofill:active {
                -webkit-text-fill-color: #ffffff !important;
                caret-color: #ffffff;
                box-shadow: 0 0 0 1000px var(--mdb-bg) inset !important;
                -webkit-box-shadow: 0 0 0 1000px var(--mdb-bg) inset !important;
                background-color: var(--mdb-bg) !important;
                transition: background-color 99999s ease-out 0s;
              }
              .auth-password-toggle {
                position: absolute;
                top: 50%;
                right: 2px;
                transform: translateY(-50%);
                width: 44px;
                height: 44px;
                min-width: 44px;
                min-height: 44px;
                border: 0;
                border-radius: 8px;
                background: transparent;
                color: var(--mdb-text-secondary);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 2;
                padding: 0;
              }
              .auth-password-toggle svg {
                width: 18px;
                height: 18px;
                stroke: var(--mdb-text-secondary);
                color: var(--mdb-text-secondary);
              }
              .auth-password-toggle:disabled {
                opacity: 0.55;
                cursor: not-allowed;
              }
            `}</style>
        </label>
    );
}
