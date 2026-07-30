export type Place = { id: string; name: string; city: string; country: string; longitude: number; latitude: number; position: number };
export type MediaKind = "image" | "video";
export type MediaAsset = { id: string; url: string; kind: MediaKind; mimeType: string; sizeBytes: number; position: number };
export type Memory = {
  id: string;
  placeId?: string;
  visitId?: string;
  title: string;
  body: string;
  occurredOn: string;
  media: MediaAsset[];
  photoUrl?: string;
  mediaUrl?: string;
  mediaKind?: MediaKind;
  version: number;
};
export type Trip = { id: string; name: string; startDate: string; endDate: string; summary: string; coverUrl?: string; version: number; places: Place[]; memories: Memory[] };
