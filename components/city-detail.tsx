"use client";

import { useMemo } from "react";
import type { Memory, Place } from "@/lib/types";
import MemoryActions, { type MemoryEditDraft } from "./memory-actions";
import MemoryMedia from "./memory-media";

type CityDetailProps = {
  place: Place;
  memories: Memory[];
  onBack: () => void;
  onAdd: () => void;
  onEdit: (memory: Memory, draft: MemoryEditDraft) => Promise<void>;
  onDelete: (memory: Memory) => Promise<void>;
};

export default function CityDetail({ place, memories, onBack, onAdd, onEdit, onDelete }: CityDetailProps) {
  const visits = useMemo(() => {
    const grouped = new Map<string, Memory[]>();
    for (const memory of memories) {
      const key = memory.visitId ?? `${memory.occurredOn}-${memory.id}`;
      const group = grouped.get(key) ?? [];
      group.push(memory);
      grouped.set(key, group);
    }
    return Array.from(grouped.entries())
      .map(([id, items]) => ({ id, occurredOn: items[0].occurredOn, memories: items }))
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  }, [memories]);
  const imageCount = memories.reduce((sum, memory) => sum + memory.media.filter((item) => item.kind === "image").length, 0);
  const videoCount = memories.reduce((sum, memory) => sum + memory.media.filter((item) => item.kind === "video").length, 0);

  return <section className="city-detail">
    <header className="city-detail-hero">
      <button className="city-back" type="button" onClick={onBack}>← 返回地球</button>
      <div className="city-orbit" aria-hidden="true"><span /></div>
      <p className="overline">{place.country} · 共同城市档案</p>
      <h1>{place.city || place.name}</h1>
      <p>每一次重逢都独立保存，旧的故事不会被新的旅程覆盖。</p>
      <div className="city-detail-metrics">
        <span><b>{visits.length}</b> 次到访</span>
        <span><b>{memories.length}</b> 段回忆</span>
        <span><b>{imageCount}</b> 张照片</span>
        <span><b>{videoCount}</b> 个视频</span>
      </div>
      <button className="city-add-memory" type="button" onClick={onAdd}>＋ 记录新一次到访</button>
    </header>

    <div className="city-visit-archive">
      {visits.length === 0 && <div className="city-detail-empty">
        <span>✦</span>
        <h2>等待第一段城市记忆</h2>
        <p>在这里记录日期、文字、照片和视频。</p>
        <button type="button" onClick={onAdd}>开始记录</button>
      </div>}
      {visits.map((visit, index) => <article className="visit-chapter" key={visit.id}>
        <aside>
          <small>到访 {String(visits.length - index).padStart(2, "0")}</small>
          <time>{visit.occurredOn}</time>
        </aside>
        <div className="visit-chapter-content">
          {visit.memories.map((memory) => <section className="visit-memory" key={memory.id}>
            <h2>{memory.title}</h2>
            {memory.body && <p>{memory.body}</p>}
            <MemoryMedia memory={memory} />
            <MemoryActions memory={memory} onEdit={onEdit} onDelete={onDelete} />
          </section>)}
        </div>
      </article>)}
    </div>
  </section>;
}
