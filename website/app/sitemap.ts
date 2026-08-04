import type { MetadataRoute } from "next";

const SITE_URL = "https://www.morphicons.com";

/* Hand-kept dates, one per route. `new Date()` would stamp every build as a
   change and teach crawlers to distrust the signal; bump a line here only when
   that page's content actually changes. */
const ROUTES: MetadataRoute.Sitemap = [
  {
    url: SITE_URL,
    lastModified: "2026-08-03",
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    url: `${SITE_URL}/showcase`,
    lastModified: "2026-08-04",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    url: `${SITE_URL}/roadmap`,
    lastModified: "2026-08-04",
    changeFrequency: "monthly",
    priority: 0.6,
  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES;
}
