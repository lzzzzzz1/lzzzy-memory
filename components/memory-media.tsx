"use client";
/* Supabase media URLs are short-lived and should bypass Next image optimization. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import type { MediaAsset, Memory } from "@/lib/types";

export default function MemoryMedia({ memory, compact = false }: { memory: Memory; compact?: boolean }) {
  const assets = useMemo<MediaAsset[]>(() => memory.media.length > 0
    ? memory.media
    : memory.mediaUrl
      ? [{ id: `${memory.id}-legacy`, url: memory.mediaUrl, kind: memory.mediaKind ?? "image" as const, mimeType: "", sizeBytes: 0, position: 1 }]
      : memory.photoUrl
        ? [{ id: `${memory.id}-legacy`, url: memory.photoUrl, kind: "image" as const, mimeType: "", sizeBytes: 0, position: 1 }]
        : [], [memory]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const visibleAssets = assets.slice(0, compact ? 4 : 5);

  useEffect(() => {
    if (activeIndex === null) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowLeft") setActiveIndex((current) => current === null ? null : (current - 1 + assets.length) % assets.length);
      if (event.key === "ArrowRight") setActiveIndex((current) => current === null ? null : (current + 1) % assets.length);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [activeIndex, assets.length]);

  if (assets.length === 0) return null;

  const activeAsset = activeIndex === null ? null : assets[activeIndex];

  return <>
    <div className={`memory-media-grid ${compact ? "compact" : ""} count-${Math.min(visibleAssets.length, 5)}`}>
      {visibleAssets.map((asset, index) => <figure className={`memory-media-item ${asset.kind}`} key={asset.id}>
        {asset.kind === "video"
          ? <video controls preload="metadata" src={asset.url} />
          : <button type="button" onClick={() => setActiveIndex(index)} aria-label={`放大查看${memory.title}的第${index + 1}张照片`}>
              <img src={asset.url} alt={`${memory.title} · 照片 ${index + 1}`} loading="lazy" />
            </button>}
        {asset.kind === "video" && <button className="media-expand" type="button" onClick={() => setActiveIndex(index)} aria-label="全屏查看视频">↗</button>}
        {index === visibleAssets.length - 1 && assets.length > visibleAssets.length && <button
          className="media-more"
          type="button"
          onClick={() => setActiveIndex(index)}
          aria-label={`还有${assets.length - visibleAssets.length}个媒体`}
        >＋{assets.length - visibleAssets.length}</button>}
      </figure>)}
    </div>
    {activeAsset && activeIndex !== null && <div className="memory-lightbox" role="dialog" aria-modal="true" aria-label={`${memory.title}媒体浏览`} onMouseDown={(event) => {
      if (event.target === event.currentTarget) setActiveIndex(null);
    }}>
      <div className="memory-lightbox-bar">
        <span>{String(activeIndex + 1).padStart(2, "0")} / {String(assets.length).padStart(2, "0")}</span>
        <strong>{memory.title}</strong>
        <button type="button" onClick={() => setActiveIndex(null)} aria-label="关闭媒体浏览">×</button>
      </div>
      <div className="memory-lightbox-stage">
        {activeAsset.kind === "video"
          ? <video controls autoPlay playsInline src={activeAsset.url} />
          : <img src={activeAsset.url} alt={`${memory.title} · 放大照片`} />}
      </div>
      {assets.length > 1 && <>
        <button className="lightbox-previous" type="button" onClick={() => setActiveIndex((activeIndex - 1 + assets.length) % assets.length)} aria-label="上一个">←</button>
        <button className="lightbox-next" type="button" onClick={() => setActiveIndex((activeIndex + 1) % assets.length)} aria-label="下一个">→</button>
      </>}
    </div>}
  </>;
}
