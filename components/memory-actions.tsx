"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Memory } from "@/lib/types";

export type MemoryEditDraft = {
  title: string;
  body: string;
  occurredOn: string;
};

type MemoryActionsProps = {
  memory: Memory;
  onEdit: (memory: Memory, draft: MemoryEditDraft) => Promise<void>;
  onDelete: (memory: Memory) => Promise<void>;
  compact?: boolean;
};

export default function MemoryActions({ memory, onEdit, onDelete, compact = false }: MemoryActionsProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setEditing(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [busy, editing]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const draft = {
      title: String(form.get("title") ?? "").trim(),
      body: String(form.get("body") ?? "").trim(),
      occurredOn: String(form.get("occurredOn") ?? ""),
    };
    if (!draft.title || !draft.occurredOn) return;
    setBusy(true);
    setError("");
    try {
      await onEdit(memory, draft);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败，请再试一次。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`确定删除“${memory.title}”吗？照片和视频也会从私密空间移除。`)) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(memory);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "删除失败，请再试一次。");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div className={`memory-actions ${compact ? "compact" : ""}`}>
      <button type="button" onClick={() => setEditing(true)} disabled={busy} aria-label={`编辑${memory.title}`}>
        <span aria-hidden="true">✎</span> 编辑
      </button>
      <button className="danger" type="button" onClick={() => void remove()} disabled={busy} aria-label={`删除${memory.title}`}>
        <span aria-hidden="true">⌫</span> 删除
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
    {editing && <div className="memory-editor-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) setEditing(false);
    }}>
      <form className="memory-editor" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby={`edit-${memory.id}`}>
        <button className="memory-editor-close" type="button" onClick={() => setEditing(false)} disabled={busy} aria-label="关闭">×</button>
        <p className="overline">EDIT MEMORY</p>
        <h2 id={`edit-${memory.id}`}>整理这段回忆</h2>
        <p>只修改文字与日期，原有照片和视频会保持不变。</p>
        <label>标题<input name="title" defaultValue={memory.title} required maxLength={120} /></label>
        <label>日期<input name="occurredOn" type="date" defaultValue={memory.occurredOn} required /></label>
        <label>文字<textarea name="body" defaultValue={memory.body} rows={6} maxLength={4000} /></label>
        {error && <p className="memory-editor-error" role="alert">{error}</p>}
        <div className="memory-editor-footer">
          <button type="button" onClick={() => setEditing(false)} disabled={busy}>取消</button>
          <button className="primary" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存修改"}</button>
        </div>
      </form>
    </div>}
  </>;
}
