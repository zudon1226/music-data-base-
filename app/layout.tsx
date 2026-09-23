import "./globals.css";
import "./mdb-theme.css";
import "../components/desktop-media-list-row.css";
import type { Metadata, Viewport } from "next";
import { MDB_AUTH_BOOT_CRITICAL_CSS } from "../lib/ui/mdb-auth-boot-css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Music Data Base",
    template: "%s | Music Data Base",
  },
  description: "Stream, discover, create, and launch music with artists and producers on Music Data Base.",
  openGraph: {
    title: "Music Data Base",
    description: "Stream, discover, create, and launch music with artists and producers.",
    url: siteUrl,
    siteName: "Music Data Base",
    images: [{ url: "/music-data-base-logo.png", alt: "Music Data Base" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Music Data Base",
    description: "Stream, discover, create, and launch music with artists and producers.",
    images: ["/music-data-base-logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Capacitor/Android WebView stamps --safe-area-inset-* onto <html> when
    // viewport-fit=cover. SSR cannot know those pixel values; ignore that one
    // attribute mismatch. Insets remain on the live element after hydration.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Critical auth-boot CSS must be document-inline: hashed CSS chunks
            404/500 when next start is not restarted after npm run build. */}
        <style
          id="mdb-auth-boot-critical"
          dangerouslySetInnerHTML={{ __html: MDB_AUTH_BOOT_CRITICAL_CSS }}
        />
        {children}
      </body>
    </html>
  );
}
