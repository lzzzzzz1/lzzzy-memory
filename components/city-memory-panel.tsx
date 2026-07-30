"use client";

import type { Memory, Place } from "@/lib/types";
import MemoryActions, { type MemoryEditDraft } from "./memory-actions";
import MemoryMedia from "./memory-media";

type CityMemoryPanelProps = {
  place: Place;
  memories: Memory[];
  onClose: () => void;
  onAdd: () => void;
  onOpenFull: () => void;
  onEdit: (memory: Memory, draft: MemoryEditDraft) => Promise<void>;
  onDelete: (memory: Memory) => Promise<void>;
};

export default function CityMemoryPanel({ place, memories, onClose, onAdd, onOpenFull, onEdit, onDelete }: CityMemoryPanelProps) {
  return <div className="city-panel-layer" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <aside className="city-panel" role="dialog" aria-modal="true" aria-labelledby="city-panel-title">
      <header className="city-panel-header">
        <div>
          <p className="overline">{place.country} · 已点亮</p>
          <h2 id="city-panel-title">{place.city || place.name}</h2>
          <p>{memories.length > 0 ? `${memories.length} 段共同回忆` : "等待你们留下第一段回忆"}</p>
        </div>
        <button className="city-panel-close" type="button" onClick={onClose} aria-label="关闭城市详情">×</button>
      </header>

      <div className="city-panel-body">
        {memories.length === 0 ? <div className="city-panel-empty">
          <span>✦</span>
          <h3>这里还没有回忆</h3>
          <p>写下一句话，或者放入一张照片与一段视频，这座城市就会成为你们共同档案的一部分。</p>
          <button type="button" onClick={onAdd}>记录在 {place.city || place.name} 的第一次</button>
        </div> : <div className="city-memory-list">
          {memories.map((memory) => <article className="city-memory-card" key={memory.id}>
            <time>{memory.occurredOn}</time>
            <h3>{memory.title}</h3>
            {memory.body && <p>{memory.body}</p>}
            <MemoryMedia memory={memory} compact />
            <MemoryActions memory={memory} onEdit={onEdit} onDelete={onDelete} compact />
          </article>)}
        </div>}
      </div>

      <footer className="city-panel-footer">
        <button className="city-panel-secondary" type="button" onClick={onOpenFull}>查看完整城市档案</button>
        <button type="button" onClick={onAdd}><span>＋</span> 添加这座城市的回忆</button>
      </footer>
    </aside>
  </div>;
}
