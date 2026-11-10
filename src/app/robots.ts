import type { MetadataRoute } from "next";

/** The app is private. Search engines may read the front page and the two legal pages and nothing else. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/$", "/privacy", "/terms"], disallow: "/" }] };
}
