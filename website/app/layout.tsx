import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://www.morphicons.com";
const TITLE = "morphicons — any icon morphs into any other";
const DESCRIPTION =
  "Universal morphing for stroke-based icons with spring physics. Rotations emerge from the math. Zero dependencies, ~6 KB gzip, works with Lucide, Tabler, Heroicons, Iconoir and any stroke pack.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — morphicons",
  },
  description: DESCRIPTION,
  keywords: [
    "icon morphing",
    "svg morph",
    "morph animation",
    "animated icons",
    "icon animation",
    "lucide",
    "lucide-react",
    "animate lucide icons",
    "feather icons",
    "tabler icons",
    "spring physics",
    "react icons",
    "svg animation",
  ],
  authors: [{ name: "Guillermo", url: "https://guillermolg.com" }],
  creator: "guillermolg.com",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "morphicons",
    locale: "en_US",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/favicon/apple-touch-icon.png",
  },
  manifest: "/favicon/site.webmanifest",
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

/* Structured data: the library as open-source software, authored by
   guillermolg.com. Single source for rich results. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "morphicons",
  description: DESCRIPTION,
  url: SITE_URL,
  codeRepository: "https://github.com/guillermolg00/morphicons",
  programmingLanguage: "TypeScript",
  runtimePlatform: "Web",
  license: "https://opensource.org/licenses/MIT",
  author: {
    "@type": "Person",
    name: "Guillermo",
    url: "https://guillermolg.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <Analytics />
      </body>
    </html>
  );
}
