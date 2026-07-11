import type { MetadataRoute } from "next";
import { siteDescription } from "@/lib/site-metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Studi",
    short_name: "Studi",
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#fdf8f2",
    theme_color: "#e05a3a",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
