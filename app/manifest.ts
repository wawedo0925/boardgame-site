import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "보드라운지",
    short_name: "보드라운지",
    description:
      "와위두 보드라운지의 보드게임 정보와 이벤트 일정을 확인하세요.",
    start_url: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      {
        src: "/boardlounge-icon-512-v3.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
