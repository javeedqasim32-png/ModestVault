import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Modaire Modest Fashion",
    short_name: "Modaire",
    description: "Luxury Pakistani and Modest Fashion Marketplace",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f5",
    theme_color: "#4a3328",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
