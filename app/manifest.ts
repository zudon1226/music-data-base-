import type { MetadataRoute } from "next";
import {
  MDB_PWA_BACKGROUND_COLOR,
  MDB_PWA_ICON_SIZES,
  MDB_PWA_ID,
  MDB_PWA_NAME,
  MDB_PWA_SHORT_NAME,
  MDB_PWA_THEME_COLOR,
  mdbPwaIconPath,
} from "../lib/pwa/mdb-pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: MDB_PWA_ID,
    name: MDB_PWA_NAME,
    short_name: MDB_PWA_SHORT_NAME,
    description:
      "Stream, discover, create, and launch music with artists and producers on Music Data Base.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "any",
    background_color: MDB_PWA_BACKGROUND_COLOR,
    theme_color: MDB_PWA_THEME_COLOR,
    lang: "en",
    dir: "ltr",
    categories: ["music", "entertainment"],
    prefer_related_applications: false,
    icons: [
      ...MDB_PWA_ICON_SIZES.map((size) => ({
        src: mdbPwaIconPath(size),
        sizes: `${size}x${size}`,
        type: "image/png" as const,
        purpose: "any" as const,
      })),
      {
        src: mdbPwaIconPath(512),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
