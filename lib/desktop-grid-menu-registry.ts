/** Ensures only one Desktop Grid card overflow menu is open at a time. */

type CloseFn = () => void;

let activeClose: CloseFn | null = null;

export function claimDesktopGridMenu(close: CloseFn): void {
    if (activeClose && activeClose !== close) {
        activeClose();
    }
    activeClose = close;
}

export function releaseDesktopGridMenu(close: CloseFn): void {
    if (activeClose === close) {
        activeClose = null;
    }
}

export function closeAllDesktopGridMenus(): void {
    if (activeClose) {
        activeClose();
        activeClose = null;
    }
}
