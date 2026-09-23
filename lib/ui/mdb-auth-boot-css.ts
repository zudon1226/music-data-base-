/**
 * Critical first-paint CSS for auth/session boot screens.
 * Inlined from layout so "Checking your session..." never depends on a
 * hashed /_next/static CSS chunk (which breaks when `next start` is left
 * running across an `npm run build` that renames those chunks).
 */
export const MDB_AUTH_BOOT_CRITICAL_CSS = `
html, body {
  margin: 0;
  min-height: 100%;
  background: #030805;
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
}
.auth-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 20px;
  box-sizing: border-box;
  overflow-x: hidden;
  background: #030805;
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
}
.auth-panel {
  width: min(440px, 100%);
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(245, 200, 76, 0.28);
  border-radius: 8px;
  background: #09110c;
  padding: 24px;
  color: #ffffff;
}
.auth-mark {
  display: grid;
  justify-items: center;
  gap: 10px;
  text-align: center;
  max-width: 100%;
}
.auth-mark img {
  width: min(260px, 82vw);
  max-width: 100%;
  height: auto;
  max-height: min(260px, 45vh);
  object-fit: contain;
  display: block;
}
.auth-mark span {
  color: #f5c84c;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0;
}
.auth-page > .auth-panel > p,
.auth-panel > p {
  margin: 14px 0 0;
  text-align: center;
  color: #c9cec9;
  font-size: 14px;
  font-weight: 700;
}
`.trim();
