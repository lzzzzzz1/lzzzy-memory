import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "我们的地图",
    short_name: "我们的地图",
    description: "两个人的私密旅行记忆",
    display: "standalone",
    start_url: "/",
    background_color: "#11243a",
    theme_color: "#11243a",
  };
}
