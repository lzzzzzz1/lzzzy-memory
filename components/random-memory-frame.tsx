"use client";
/* Supabase media URLs are short-lived and should bypass Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, type CSSProperties } from "react";
import type { Memory, Place } from "@/lib/types";

type RandomMemoryFrameProps = {
  places: Place[];
  memories: Memory[];
  onOpenCity: (place: Place) => void;
};

type FramedPhoto = {
  id: string;
  url: string;
  memory: Memory;
  place: Place;
};

function stableTilt(value: string) {
  const score = Array.from(value).reduce((total, character) => total + character.charCodeAt(0), 0);
  return (score % 7) - 3;
}

export default function RandomMemoryFrame({ places, memories, onOpenCity }: RandomMemoryFrameProps) {
  const photos = useMemo<FramedPhoto[]>(() => memories.flatMap((memory) => {
    const place = places.find((item) => item.id === memory.placeId);
    if (!place) return [];
    const assets = memory.media.length > 0
      ? memory.media
      : memory.photoUrl
        ? [{ id: `${memory.id}-legacy`, url: memory.photoUrl, kind: "image" as const }]
        : [];
    return assets
      .filter((asset) => asset.kind === "image")
      .map((asset) => ({ id: asset.id, url: asset.url, memory, place }));
  }), [memories, places]);
  const [activeIndex, setActiveIndex] = useState(0);

  if (photos.length === 0) return null;

  const safeIndex = activeIndex % photos.length;
  const active = photos[safeIndex];
  const shuffle = () => {
    if (photos.length < 2) return;
    setActiveIndex((current) => {
      const step = 1 + Math.floor(Math.random() * (photos.length - 1));
      return (current + step) % photos.length;
    });
  };

  return <section className="random-memory-frame" aria-label="随机回忆相框">
    <div className="random-frame-copy">
      <p className="overline">RANDOM FRAME · {String(photos.length).padStart(2, "0")} PHOTOS</p>
      <h2>让一张旧照片，带我们回到那座城</h2>
      <p>从共同档案里随机翻出一刻。可以换一张，也可以直接打开这座城市的完整故事。</p>
      <div>
        <button type="button" onClick={shuffle} disabled={photos.length < 2}>
          <span aria-hidden="true">↻</span> 换一张
        </button>
        <button type="button" className="open-frame-city" onClick={() => onOpenCity(active.place)}>
          打开{active.place.city || active.place.name}的回忆 →
        </button>
      </div>
    </div>
    <button
      className="random-polaroid"
      style={{ "--frame-tilt": `${stableTilt(active.id)}deg` } as CSSProperties}
      type="button"
      onClick={() => onOpenCity(active.place)}
      aria-label={`打开${active.place.city || active.place.name}的回忆`}
    >
      <span className="random-photo-stage">
        <img key={active.id} src={active.url} alt={`${active.memory.title} · ${active.place.city || active.place.name}`} />
      </span>
      <span className="random-photo-meta">
        <span><b>{active.place.city || active.place.name}</b><small>{active.place.country}</small></span>
        <time>{active.memory.occurredOn}</time>
      </span>
      <strong>{active.memory.title}</strong>
    </button>
  </section>;
}
