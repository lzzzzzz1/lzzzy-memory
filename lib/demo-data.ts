import type { Trip } from "./types";

export const demoTrip: Trip = {
  id: "demo-osaka-2026", name: "大阪的初夏", startDate: "2026-06-14", endDate: "2026-06-18", version: 1,
  summary: "在梅雨来临前，把夜色、章鱼烧和彼此的笑声装进了一卷胶片。",
  places: [
    { id: "osaka", name: "道顿堀", city: "大阪", country: "日本", longitude: 135.5015, latitude: 34.6687, position: 1 },
    { id: "kyoto", name: "伏见稻荷大社", city: "京都", country: "日本", longitude: 135.7727, latitude: 34.9671, position: 2 },
  ],
  memories: [{
    id: "demo-memory",
    placeId: "osaka",
    visitId: "demo-visit",
    title: "雨前的霓虹",
    body: "我们绕过拥挤的人群，在河边等到招牌一点点亮起来。你说这座城市像一封没有写完的信。",
    occurredOn: "2026-06-15",
    media: [{ id: "demo-photo", url: "/demo-osaka.svg", kind: "image", mimeType: "image/svg+xml", sizeBytes: 0, position: 1 }],
    photoUrl: "/demo-osaka.svg",
    version: 1,
  }],
};
