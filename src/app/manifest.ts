import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Billfold",
    short_name: "Billfold",
    description: "Collect your recurring bills, file them neatly and send one clear summary.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f3ec",
    theme_color: "#1f5c46",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
