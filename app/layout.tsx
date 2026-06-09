import "./globals.css";
import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
