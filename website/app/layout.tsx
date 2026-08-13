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
const TITLE = "morphicons — SVG icon morphing library for React, Vue & Svelte";
const DESCRIPTION =
  "Morph any SVG icon into any other with spring physics. Animate Lucide, Tabler and Heroicons in React, Vue, Svelte, React Native, Astro or vanilla JS. Zero dependencies, ~6 KB gzip.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — morphicons",
  },
  description: DESCRIPTION,
  keywords: [
    "morph svg icon library",
    "svg morph animation",
    "icon morphing",
    "svg morph",
    "morph animation",
    "animated icons react",
    "react animated icon library",
    "animated icons vue",
    "vue icon morph",
    "animated icons svelte",
    "svelte icon morph",
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

const REPO_URL = "https://github.com/guillermolg00/morphicons";
const NPM_URL = "https://www.npmjs.com/package/morphicons";
const MIT_LICENSE = "https://opensource.org/licenses/MIT";

const AUTHOR = {
  "@type": "Person",
  name: "Guillermo",
  url: "https://guillermolg.com",
} as const;

/* Structured data as a graph: the same library described twice on purpose —
   as a developer tool (SoftwareApplication, the type search engines read for
   category and price) and as source code (SoftwareSourceCode, the type that
   carries the repo and the language) — plus the site itself. MIT is stated as
   a zero-price Offer because "free" is a fact crawlers only read from there. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}#software`,
      name: "morphicons",
      description: DESCRIPTION,
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "JavaScript animation library",
      operatingSystem: "Web browser",
      softwareVersion: "1.4.0",
      license: MIT_LICENSE,
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      keywords:
        "svg morph animation, morph svg icon library, animated icons react, animated icons vue, animated icons svelte, animate lucide icons, icon morphing",
      author: AUTHOR,
      sameAs: [REPO_URL, NPM_URL],
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${SITE_URL}#source`,
      name: "morphicons",
      description: DESCRIPTION,
      url: SITE_URL,
      codeRepository: REPO_URL,
      programmingLanguage: "TypeScript",
      runtimePlatform: "Web",
      license: MIT_LICENSE,
      author: AUTHOR,
      about: { "@id": `${SITE_URL}#software` },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      name: "morphicons",
      description: DESCRIPTION,
      url: SITE_URL,
      inLanguage: "en",
      author: AUTHOR,
      about: { "@id": `${SITE_URL}#software` },
    },
  ],
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
        {/* JSON.stringify does not sanitize for XSS: scrub `<` per the Next
            JSON-LD guide (node_modules/next/dist/docs/01-app/02-guides). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
        <Analytics />
      </body>
    </html>
  );
}
