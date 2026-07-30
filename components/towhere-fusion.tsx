"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createFirst,
  loadSharedArchive,
  type SharedArchiveData,
  type SharedFirst,
} from "@/lib/shared-archive";
import { supabase } from "@/lib/supabase";
import type { Trip } from "@/lib/types";

export type ArchiveSection = "universe" | "firsts";

type Props = {
  section: ArchiveSection;
  trip: Trip;
  coupleId?: string;
  userId?: string;
};

const EMPTY_ARCHIVE: SharedArchiveData = { firsts: [], letters: [], checkins: [] };

function localDate(): string {
  return new Date().toLocaleDateString("sv-SE");
}

function errorMessage(error: unknown): string {
  const detail = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "未知错误";
  if (detail.includes("couple_firsts") || detail.includes("couple_letters") || detail.includes("couple_checkins")) {
    return "请先在 Supabase 运行 202607300004_towhere_fusion.sql 迁移。";
  }
  if (detail.includes("STALE_VERSION")) return "内容已被另一设备修改，请刷新后再试。";
  return detail;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function keywordsFromText(value: string): string[] {
  return value
    .split(/[\s，。、“”‘’！？,.!?:：;；/\\|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 12);
}

export default function TowhereFusion({ section, trip, coupleId, userId }: Props) {
  const [archive, setArchive] = useState<SharedArchiveData>(EMPTY_ARCHIVE);
  const [loading, setLoading] = useState(Boolean(supabase && coupleId));
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase || !coupleId) return;
    let cancelled = false;
    void loadSharedArchive(supabase, coupleId)
      .then((data) => {
        if (!cancelled) {
          setArchive(data);
          setNotice("");
        }
      })
      .catch((error) => {
        if (!cancelled) setNotice(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [coupleId]);

  const addFirst = async (draft: Omit<SharedFirst, "id" | "version">) => {
    try {
      const item = supabase && coupleId && userId
        ? await createFirst(supabase, { coupleId, userId, ...draft })
        : { ...draft, id: crypto.randomUUID(), version: 1 };
      setArchive((current) => ({ ...current, firsts: [item, ...current.firsts] }));
      setNotice("第一次已保存到你们的共同档案。");
    } catch (error) {
      setNotice(errorMessage(error));
      throw error;
    }
  };

  return <section className={`shared-archive shared-${section}`}>
    {loading && <p className="archive-loading">正在打开你们的共同档案…</p>}
    {section === "universe" && <MemoryUniverse trip={trip} archive={archive} />}
    {section === "firsts" && <FirstsArchive items={archive.firsts} onCreate={addFirst} />}
    {notice && <p className="archive-notice" role="status">{notice}</p>}
  </section>;
}

function MemoryUniverse({ trip, archive }: { trip: Trip; archive: SharedArchiveData }) {
  const nodes = useMemo(() => {
    const candidates = [
      ...trip.places.flatMap((place) => [place.city, place.country]),
      ...trip.memories.flatMap((memory) => [memory.title, ...keywordsFromText(memory.body)]),
      ...archive.firsts.flatMap((item) => [item.title, item.category]),
    ].filter(Boolean);
    const unique = Array.from(new Set(candidates)).slice(0, 32);
    return unique.map((label, index) => {
      const seed = hash(`${label}-${index}`);
      const relatedMemories = trip.memories.filter((memory) => `${memory.title} ${memory.body}`.includes(label));
      return {
        label,
        x: 8 + (seed % 84),
        y: 12 + (Math.floor(seed / 101) % 74),
        size: 9 + Math.min(relatedMemories.length * 3, 10) + (seed % 4),
        count: relatedMemories.length,
      };
    });
  }, [archive, trip]);
  const [selected, setSelected] = useState(nodes[0]?.label ?? "");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const selectedNode = nodes.find((node) => node.label === selected);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
      moved: false,
    };
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) drag.moved = true;
    setOffset({
      x: Math.max(-260, Math.min(260, drag.originX + deltaX)),
      y: Math.max(-190, Math.min(190, drag.originY + deltaY)),
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return <div className="universe-stage">
    <div className="universe-copy">
      <p className="archive-kicker">MEMORY UNIVERSE</p>
      <h1>我们的回忆宇宙</h1>
      <p>每一次出发、每一座城市和每一句话，都会在这里变成一束光。</p>
    </div>
    <div
      className={`universe-sky ${dragging ? "dragging" : ""}`}
      role="group"
      aria-label="可拖动的回忆关键词星图"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div className="universe-field" style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}>
        <div className="universe-halo" />
        {nodes.length === 0 && <button className="universe-empty" type="button">从点亮第一座城市开始</button>}
        {nodes.map((node) => <button
          key={node.label}
          type="button"
          className={`memory-star ${selected === node.label ? "selected" : ""}`}
          style={{ left: `${node.x}%`, top: `${node.y}%`, width: node.size, height: node.size }}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            setSelected(node.label);
          }}
          aria-label={`查看 ${node.label}`}
        >
          <span>{node.label}</span>
        </button>)}
        <div className="universe-orbit orbit-one" />
        <div className="universe-orbit orbit-two" />
      </div>
      <span className="universe-drag-hint">拖动探索回忆星图</span>
      {(offset.x !== 0 || offset.y !== 0) && <button
        className="universe-reset"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOffset({ x: 0, y: 0 });
        }}
      >回到中心</button>}
    </div>
    <aside className="universe-inspector">
      <p>{nodes.length.toString().padStart(2, "0")} 束光</p>
      <h2>{selectedNode?.label || "等待第一束光"}</h2>
      <span>{selectedNode ? `${selectedNode.count} 段文字回忆与它直接相连` : "去旅行地球记录一次共同出发。"}</span>
      <div className="universe-stats">
        <b>{trip.places.length}<small>城市</small></b>
        <b>{trip.memories.length}<small>回忆</small></b>
        <b>{archive.firsts.length}<small>第一次</small></b>
      </div>
    </aside>
  </div>;
}

function FirstsArchive({ items, onCreate }: { items: SharedFirst[]; onCreate: (draft: Omit<SharedFirst, "id" | "version">) => Promise<void> }) {
  const [composing, setComposing] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSaving(true);
    try {
      await onCreate({
        title: String(form.get("title") ?? ""),
        body: String(form.get("body") ?? ""),
        happenedOn: String(form.get("date") ?? localDate()),
        category: String(form.get("category") ?? "旅行"),
      });
      formElement.reset();
      setComposing(false);
    } finally {
      setSaving(false);
    }
  };

  return <div className="paper-archive">
    <header className="archive-header">
      <div><p className="archive-kicker">OUR FIRSTS</p><h1>一起收藏所有第一次</h1><p>第一次去一座城市，第一次迷路，第一次看到同一片海。</p></div>
      <button type="button" onClick={() => setComposing(true)}>＋ 记录第一次</button>
    </header>
    {items.length === 0 && <button className="archive-empty-card" type="button" onClick={() => setComposing(true)}><span>01</span><b>还没有写下第一次</b><small>它不必宏大，只要对你们有意义。</small></button>}
    <div className="firsts-timeline">
      {items.map((item, index) => <article key={item.id}>
        <div className="first-index">{String(items.length - index).padStart(2, "0")}</div>
        <time>{item.happenedOn}</time>
        <p className="first-category">{item.category}</p>
        <h2>{item.title}</h2>
        {item.body && <p>{item.body}</p>}
      </article>)}
    </div>
    {composing && <ArchiveModal title="写下一个第一次" onClose={() => setComposing(false)}>
      <form className="archive-form" onSubmit={submit}>
        <label>标题<input name="title" required maxLength={120} placeholder="第一次一起看海" /></label>
        <div className="archive-form-row">
          <label>日期<input name="date" type="date" defaultValue={localDate()} required /></label>
          <label>类别<input name="category" defaultValue="旅行" maxLength={30} required /></label>
        </div>
        <label>当时发生了什么<textarea name="body" rows={5} maxLength={3000} placeholder="写下一点只属于你们的细节…" /></label>
        <button className="archive-primary" disabled={saving}>{saving ? "正在保存…" : "保存到共同档案"}</button>
      </form>
    </ArchiveModal>}
  </div>;
}

function ArchiveModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="archive-modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="archive-modal" role="dialog" aria-modal="true" aria-label={title}>
      <button className="archive-close" type="button" onClick={onClose} aria-label="关闭">×</button>
      <p className="archive-kicker">PRIVATE ARCHIVE</p>
      <h2>{title}</h2>
      {children}
    </section>
  </div>;
}
