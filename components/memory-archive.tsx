"use client";
/* Supabase media URLs are short-lived and should bypass Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import type { Memory, Place } from "@/lib/types";

type MemoryArchiveProps = {
  places: Place[];
  memories: Memory[];
  onOpenCity: (place: Place) => void;
  onAdd: () => void;
};

export default function MemoryArchive({ places, memories, onOpenCity, onAdd }: MemoryArchiveProps) {
  return <section className="atlas-library">
    <header>
      <div>
        <p className="overline">CITY CHAPTERS · {places.length} CITIES · {memories.length} MEMORIES</p>
        <h2>去过的城市，都有自己的章节</h2>
      </div>
      <button type="button" onClick={onAdd}>＋ 记录一次出发</button>
    </header>
    <div className="city-archive-grid">
      {places.map((place, index) => {
        const cityMemories = memories
          .filter((memory) => memory.placeId === place.id)
          .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
        const mediaCount = cityMemories.reduce((total, memory) => total + memory.media.length, 0);
        const latest = cityMemories[0];
        const cover = cityMemories.flatMap((memory) => memory.media).find((asset) => asset.kind === "image");
        return <button className={`city-archive-card ${cover ? "has-cover" : ""}`} key={place.id} type="button" onClick={() => onOpenCity(place)}>
          {cover && <img className="archive-cover" src={cover.url} alt="" loading="lazy" />}
          {cover && <span className="archive-cover-shade" aria-hidden="true" />}
          <span className="archive-index">{String(index + 1).padStart(2, "0")}</span>
          <span className="archive-light" aria-hidden="true" />
          <strong>{place.city || place.name}</strong>
          <small>{place.country}</small>
          <span className="archive-summary">{cityMemories.length} 段回忆 · {mediaCount} 个媒体</span>
          <span className="archive-latest">{latest ? `${latest.occurredOn} · ${latest.title}` : "等待第一段故事"}</span>
          <span className="archive-arrow">↗</span>
        </button>;
      })}
      {places.length === 0 && <button className="city-archive-empty" type="button" onClick={onAdd}>
        <span>✦</span>
        <strong>点亮第一座城市</strong>
        <small>城市档案会从这里开始生长。</small>
      </button>}
    </div>
  </section>;
}
