export const UPLOAD_LOCK_MESSAGE =
    "Uploads are temporarily disabled while Music Data Base is under construction.";

export const UPLOAD_LOCK_OWNER_EMAIL = "zudon1226@gmail.com";

const BUILT_IN_UPLOAD_ALLOWED_EMAILS = [UPLOAD_LOCK_OWNER_EMAIL];

function parseTruthyFlag(value: string | undefined) {
    const normalized = (value || "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function areUploadsLocked() {
    return parseTruthyFlag(process.env.NEXT_PUBLIC_UPLOADS_LOCKED);
}

export function getUploadAllowedEmails() {
    const configured = (process.env.NEXT_PUBLIC_UPLOAD_ALLOWED_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
    return [...new Set([...BUILT_IN_UPLOAD_ALLOWED_EMAILS, ...configured])];
}

export function canUserUpload(email: string | null | undefined) {
    if (!areUploadsLocked()) {
        return true;
    }
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
        return false;
    }
    return getUploadAllowedEmails().includes(normalizedEmail);
}

export function isUploadBlockedForEmail(email: string | null | undefined) {
    return areUploadsLocked() && !canUserUpload(email);
}
