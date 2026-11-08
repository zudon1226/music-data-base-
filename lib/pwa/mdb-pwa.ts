/** PWA identity for Microsoft Store / Edge install (production origin). */
export const MDB_PWA_ID = "https://www.digitalmusicdatabase.com/";
export const MDB_PWA_NAME = "Music Data Base";
export const MDB_PWA_SHORT_NAME = "MDB";
export const MDB_PWA_THEME_COLOR = "#030805";
export const MDB_PWA_BACKGROUND_COLOR = "#030805";

export const MDB_PWA_ICON_SIZES = [44, 50, 150, 192, 310, 512] as const;

export function mdbPwaIconPath(size: number): string {
  return `/pwa/icon-${size}.png`;
}
